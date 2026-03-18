"""Terminal panel widget with interactive shell support.

The *TerminalWidget* handles two modes:

* **Append mode** (during container creation) – coloured output is appended
  at the end of the document via `append_ansi()`.
* **Interactive mode** (after creation) – a bash shell is attached and the
  widget processes PTY output character-by-character so cursor movement,
  overwrite, and line-erase codes work for normal shell usage.

Keyboard input is captured and forwarded to the PTY through the
``input_signal``.
"""

from __future__ import annotations

import shlex
import shutil
import subprocess

from PySide6.QtCore import Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QTextCharFormat, QTextCursor
from PySide6.QtWidgets import (
    QApplication,
    QFrame,
    QHBoxLayout,
    QLabel,
    QPushButton,
    QStackedWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from fluid.gui.theme import COLORS, mono_font

# ── ANSI 16-colour palette (Tokyo Night) ──────────────────────────

_COLORS_16 = [
    "#414868", "#f7768e", "#9ece6a", "#e0af68",
    "#7aa2f7", "#bb9af7", "#7dcfff", "#c0caf5",
    "#565f89", "#ff7a93", "#b9f27c", "#ff9e64",
    "#7da6ff", "#c7a0f5", "#89d4ff", "#c0caf5",
]


# ── ANSI SGR state machine ────────────────────────────────────────

class AnsiState:
    """Track current graphic-rendition state and produce QTextCharFormat."""

    def __init__(self):
        self._reset()

    def _reset(self):
        self.fg: QColor | None = None
        self.bg: QColor | None = None
        self.bold = False
        self.dim = False
        self.italic = False
        self.underline = False

    def make_format(self, base_font: QFont) -> QTextCharFormat:
        fmt = QTextCharFormat()
        fmt.setFont(base_font)

        fg = self.fg or QColor(COLORS["fg"])
        if self.dim:
            fg = QColor(fg)
            fg.setAlphaF(0.55)
        fmt.setForeground(fg)

        if self.bg:
            fmt.setBackground(self.bg)
        if self.bold:
            fmt.setFontWeight(QFont.Weight.Bold)
        if self.italic:
            fmt.setFontItalic(True)
        if self.underline:
            fmt.setFontUnderline(True)
        return fmt

    def apply_sgr(self, params: str):
        codes: list[int] = []
        for p in params.split(";"):
            if p.isdigit():
                codes.append(int(p))
            elif p == "":
                codes.append(0)
        if not codes:
            codes = [0]

        i = 0
        while i < len(codes):
            c = codes[i]
            if c == 0:
                self._reset()
            elif c == 1:
                self.bold = True
            elif c == 2:
                self.dim = True
            elif c == 3:
                self.italic = True
            elif c == 4:
                self.underline = True
            elif c == 22:
                self.bold = False
                self.dim = False
            elif c == 23:
                self.italic = False
            elif c == 24:
                self.underline = False
            elif 30 <= c <= 37:
                self.fg = QColor(_COLORS_16[c - 30])
            elif c == 38:
                color, skip = _parse_extended_color(codes, i)
                if color:
                    self.fg = color
                i += skip
            elif c == 39:
                self.fg = None
            elif 40 <= c <= 47:
                self.bg = QColor(_COLORS_16[c - 40])
            elif c == 48:
                color, skip = _parse_extended_color(codes, i)
                if color:
                    self.bg = color
                i += skip
            elif c == 49:
                self.bg = None
            elif 90 <= c <= 97:
                self.fg = QColor(_COLORS_16[c - 90 + 8])
            elif 100 <= c <= 107:
                self.bg = QColor(_COLORS_16[c - 100 + 8])
            i += 1

    # ── append-mode parser (strips \r, splits on SGR only) ────────

    def parse_append(
        self, text: str, font: QFont
    ) -> list[tuple[str, QTextCharFormat]]:
        import re

        sgr_re = re.compile(r"\033\[([0-9;]*)m")
        segments: list[tuple[str, QTextCharFormat]] = []
        pos = 0
        for m in sgr_re.finditer(text):
            if m.start() > pos:
                raw = text[pos : m.start()]
                raw = raw.replace("\r\n", "\n").replace("\r", "")
                if raw:
                    segments.append((raw, self.make_format(font)))
            self.apply_sgr(m.group(1))
            pos = m.end()
        if pos < len(text):
            raw = text[pos:]
            raw = raw.replace("\r\n", "\n").replace("\r", "")
            if raw:
                segments.append((raw, self.make_format(font)))
        return segments


def _parse_extended_color(
    codes: list[int], i: int
) -> tuple[QColor | None, int]:
    if i + 1 < len(codes):
        if codes[i + 1] == 5 and i + 2 < len(codes):
            return _color_256(codes[i + 2]), 2
        if codes[i + 1] == 2 and i + 4 < len(codes):
            return QColor(codes[i + 2], codes[i + 3], codes[i + 4]), 4
    return None, 0


def _color_256(n: int) -> QColor:
    if n < 16:
        return QColor(_COLORS_16[n])
    if n < 232:
        n -= 16
        r = (n // 36) * 51 if (n // 36) else 0
        g = ((n % 36) // 6) * 51 if ((n % 36) // 6) else 0
        b = (n % 6) * 51 if (n % 6) else 0
        return QColor(r, g, b)
    v = 8 + (n - 232) * 10
    return QColor(v, v, v)


# ── Terminal widget ───────────────────────────────────────────────

class TerminalWidget(QTextEdit):
    """QTextEdit that doubles as an interactive terminal.

    * ``append_ansi(text)`` – append-only (creation phase).
    * ``feed(data)`` – cursor-aware processing (shell phase).
    * Keyboard input emitted via ``input_signal``.
    """

    input_signal = Signal(bytes)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setReadOnly(True)
        self.setLineWrapMode(QTextEdit.LineWrapMode.WidgetWidth)
        self._font = mono_font(10)
        self.setFont(self._font)
        self.setFocusPolicy(Qt.FocusPolicy.ClickFocus)

        self._parser = AnsiState()
        self._interactive = False
        self._partial = ""
        self._term_pos = 0          # terminal cursor as document offset

    # ── mode switching ────────────────────────────────────────────

    def set_interactive(self, enabled: bool):
        self._interactive = enabled
        if enabled:
            self.setReadOnly(False)
            self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)
            self.setFocus()
            c = self.textCursor()
            c.movePosition(QTextCursor.MoveOperation.End)
            self.setTextCursor(c)
            self._term_pos = c.position()
        else:
            self.setReadOnly(True)
            self.setFocusPolicy(Qt.FocusPolicy.ClickFocus)

    # ── append mode (creation output) ─────────────────────────────

    def append_ansi(self, text: str):
        cursor = QTextCursor(self.document())
        cursor.movePosition(QTextCursor.MoveOperation.End)

        for chunk, fmt in self._parser.parse_append(text, self._font):
            if chunk:
                cursor.insertText(chunk, fmt)

        self._term_pos = cursor.position()
        self._scroll_bottom()

    # ── interactive mode (shell output) ───────────────────────────

    def feed(self, data: str):                             # noqa: C901
        data = self._partial + data
        self._partial = ""

        cursor = QTextCursor(self.document())
        cursor.setPosition(min(self._term_pos, self.document().characterCount() - 1))

        i = 0
        n = len(data)

        while i < n:
            ch = data[i]

            if ch == "\x1b":
                seq = self._consume_escape(data, i)
                if seq is None:
                    self._partial = data[i:]
                    break
                self._handle_escape(cursor, seq)
                i += seq[3]

            elif ch == "\r":
                cursor.movePosition(QTextCursor.MoveOperation.StartOfBlock)
                i += 1

            elif ch == "\n":
                if not cursor.movePosition(QTextCursor.MoveOperation.NextBlock):
                    cursor.movePosition(QTextCursor.MoveOperation.End)
                    cursor.insertText("\n")
                cursor.movePosition(QTextCursor.MoveOperation.StartOfBlock)
                i += 1

            elif ch == "\b":
                if cursor.positionInBlock() > 0:
                    cursor.movePosition(QTextCursor.MoveOperation.Left)
                i += 1

            elif ch == "\t":
                spaces = 8 - (cursor.positionInBlock() % 8)
                self._overwrite(cursor, " " * spaces)
                i += 1

            elif ch == "\x07":
                i += 1

            elif ch >= " ":
                j = i + 1
                while j < n and data[j] >= " " and data[j] != "\x1b":
                    j += 1
                self._overwrite(cursor, data[i:j])
                i = j

            else:
                i += 1

        self._term_pos = cursor.position()

        vis = self.textCursor()
        vis.setPosition(self._term_pos)
        self.setTextCursor(vis)
        self._scroll_bottom()

    # ── escape sequence dispatcher ────────────────────────────────

    @staticmethod
    def _consume_escape(data: str, pos: int):
        """Return (type, params, cmd, total_len) or None if incomplete."""
        if pos + 1 >= len(data):
            return None
        c1 = data[pos + 1]

        if c1 == "[":
            j = pos + 2
            while j < len(data) and (
                data[j].isdigit() or data[j] in ";?>"
            ):
                j += 1
            if j >= len(data):
                return None
            return ("CSI", data[pos + 2 : j], data[j], j - pos + 1)

        if c1 == "]":
            j = pos + 2
            while j < len(data):
                if data[j] == "\x07":
                    return ("OSC", "", "", j - pos + 1)
                if data[j] == "\x1b" and j + 1 < len(data) and data[j + 1] == "\\":
                    return ("OSC", "", "", j - pos + 2)
                j += 1
            return None

        if c1 in ("(", ")") and pos + 2 < len(data):
            return ("CHARSET", "", "", 3)

        return ("ESC", "", c1, 2)

    def _handle_escape(self, cursor: QTextCursor, seq: tuple):
        stype, params, cmd, _ = seq
        if stype == "CSI":
            self._handle_csi(cursor, params, cmd)
        elif stype == "ESC" and cmd == "c":
            QTextEdit.clear(self)
            self._term_pos = 0

    def _handle_csi(self, cursor: QTextCursor, params: str, cmd: str):
        clean = params.lstrip("?")
        num = int(clean) if clean.isdigit() else 0
        n = max(num, 1)

        if cmd == "m":
            self._parser.apply_sgr(params)
        elif cmd == "K":
            self._erase_line(cursor, num)
        elif cmd == "J":
            self._erase_display(cursor, num)
        elif cmd == "A":
            cursor.movePosition(QTextCursor.MoveOperation.Up, n=n)
        elif cmd == "B":
            cursor.movePosition(QTextCursor.MoveOperation.Down, n=n)
        elif cmd == "C":
            cursor.movePosition(QTextCursor.MoveOperation.Right, n=n)
        elif cmd == "D":
            cursor.movePosition(QTextCursor.MoveOperation.Left, n=n)
        elif cmd in ("H", "f"):
            self._cursor_position(cursor, params)
        elif cmd == "G":
            cursor.movePosition(QTextCursor.MoveOperation.StartOfBlock)
            if n > 1:
                cursor.movePosition(QTextCursor.MoveOperation.Right, n=n - 1)
        elif cmd == "P":
            for _ in range(n):
                if cursor.positionInBlock() < cursor.block().length() - 1:
                    cursor.deleteChar()
        elif cmd == "@":
            fmt = self._parser.make_format(self._font)
            cursor.insertText(" " * n, fmt)

    # ── CSI sub-handlers ──────────────────────────────────────────

    def _erase_line(self, cursor: QTextCursor, mode: int):
        if mode == 0:
            cursor.movePosition(
                QTextCursor.MoveOperation.EndOfBlock,
                QTextCursor.MoveMode.KeepAnchor,
            )
            cursor.removeSelectedText()
        elif mode == 1:
            cursor.movePosition(
                QTextCursor.MoveOperation.StartOfBlock,
                QTextCursor.MoveMode.KeepAnchor,
            )
            cursor.removeSelectedText()
        elif mode == 2:
            cursor.movePosition(QTextCursor.MoveOperation.StartOfBlock)
            cursor.movePosition(
                QTextCursor.MoveOperation.EndOfBlock,
                QTextCursor.MoveMode.KeepAnchor,
            )
            cursor.removeSelectedText()

    def _erase_display(self, cursor: QTextCursor, mode: int):
        if mode == 0:
            cursor.movePosition(
                QTextCursor.MoveOperation.End,
                QTextCursor.MoveMode.KeepAnchor,
            )
            cursor.removeSelectedText()
        elif mode == 1:
            cursor.movePosition(
                QTextCursor.MoveOperation.Start,
                QTextCursor.MoveMode.KeepAnchor,
            )
            cursor.removeSelectedText()
        elif mode in (2, 3):
            QTextEdit.clear(self)

    def _cursor_position(self, cursor: QTextCursor, params: str):
        parts = params.split(";") if params else []
        row = int(parts[0]) - 1 if parts and parts[0].isdigit() else 0
        col = int(parts[1]) - 1 if len(parts) > 1 and parts[1].isdigit() else 0

        cursor.movePosition(QTextCursor.MoveOperation.Start)
        for _ in range(row):
            if not cursor.movePosition(QTextCursor.MoveOperation.NextBlock):
                cursor.movePosition(QTextCursor.MoveOperation.End)
                cursor.insertText("\n")

        block_len = cursor.block().length() - 1
        if col > block_len:
            cursor.movePosition(QTextCursor.MoveOperation.EndOfBlock)
            fmt = self._parser.make_format(self._font)
            cursor.insertText(" " * (col - block_len), fmt)
        elif col > 0:
            cursor.movePosition(QTextCursor.MoveOperation.StartOfBlock)
            cursor.movePosition(QTextCursor.MoveOperation.Right, n=col)

    # ── text helpers ──────────────────────────────────────────────

    def _overwrite(self, cursor: QTextCursor, text: str):
        """Write *text* at cursor, overwriting any characters already there."""
        fmt = self._parser.make_format(self._font)
        remaining = cursor.block().length() - 1 - cursor.positionInBlock()

        if remaining <= 0:
            cursor.insertText(text, fmt)
        elif remaining >= len(text):
            cursor.movePosition(
                QTextCursor.MoveOperation.Right,
                QTextCursor.MoveMode.KeepAnchor,
                len(text),
            )
            cursor.insertText(text, fmt)
        else:
            cursor.movePosition(
                QTextCursor.MoveOperation.Right,
                QTextCursor.MoveMode.KeepAnchor,
                remaining,
            )
            cursor.insertText(text, fmt)

    def _scroll_bottom(self):
        sb = self.verticalScrollBar()
        sb.setValue(sb.maximum())

    # ── keyboard input ────────────────────────────────────────────

    def keyPressEvent(self, event):
        if not self._interactive:
            super().keyPressEvent(event)
            return

        key = event.key()
        mods = event.modifiers()
        ctrl = bool(mods & Qt.KeyboardModifier.ControlModifier)
        shift = bool(mods & Qt.KeyboardModifier.ShiftModifier)

        if ctrl and shift:
            if key == Qt.Key.Key_C:
                self.copy()
                return
            if key == Qt.Key.Key_V:
                text = QApplication.clipboard().text()
                if text:
                    self.input_signal.emit(text.encode("utf-8"))
                return

        data = self._key_to_bytes(event)
        if data:
            self.input_signal.emit(data)

    def inputMethodEvent(self, event):
        if not self._interactive:
            super().inputMethodEvent(event)
            return
        text = event.commitString()
        if text:
            self.input_signal.emit(text.encode("utf-8"))
        event.accept()

    @staticmethod
    def _key_to_bytes(event) -> bytes | None:
        key = event.key()
        mods = event.modifiers()
        text = event.text()

        if mods & Qt.KeyboardModifier.ControlModifier and not (
            mods & Qt.KeyboardModifier.ShiftModifier
        ):
            if Qt.Key.Key_A <= key <= Qt.Key.Key_Z:
                return bytes([key - Qt.Key.Key_A + 1])
            extra = {
                Qt.Key.Key_BracketLeft: b"\x1b",
                Qt.Key.Key_Backslash: b"\x1c",
                Qt.Key.Key_BracketRight: b"\x1d",
            }
            if key in extra:
                return extra[key]

        _MAP = {
            Qt.Key.Key_Return: b"\r",
            Qt.Key.Key_Enter: b"\r",
            Qt.Key.Key_Backspace: b"\x7f",
            Qt.Key.Key_Tab: b"\t",
            Qt.Key.Key_Escape: b"\x1b",
            Qt.Key.Key_Up: b"\x1b[A",
            Qt.Key.Key_Down: b"\x1b[B",
            Qt.Key.Key_Right: b"\x1b[C",
            Qt.Key.Key_Left: b"\x1b[D",
            Qt.Key.Key_Home: b"\x1b[H",
            Qt.Key.Key_End: b"\x1b[F",
            Qt.Key.Key_Delete: b"\x1b[3~",
            Qt.Key.Key_PageUp: b"\x1b[5~",
            Qt.Key.Key_PageDown: b"\x1b[6~",
            Qt.Key.Key_Insert: b"\x1b[2~",
        }
        if key in _MAP:
            return _MAP[key]

        if text and ord(text[0]) >= 32:
            return text.encode("utf-8")

        return None

    # ── clear ─────────────────────────────────────────────────────

    def clear(self):
        super().clear()
        self._parser = AnsiState()
        self._partial = ""
        self._term_pos = 0


# ── External-terminal helpers ─────────────────────────────────────

def _find_terminal() -> str | None:
    for cmd in (
        "gnome-terminal", "konsole", "xfce4-terminal",
        "mate-terminal", "lxterminal", "x-terminal-emulator", "xterm",
    ):
        if shutil.which(cmd):
            return cmd
    return None


def _run_in_terminal(terminal: str, cmd: list[str]):
    try:
        if terminal == "gnome-terminal":
            subprocess.Popen(["gnome-terminal", "--", *cmd], start_new_session=True)
        elif terminal == "konsole":
            subprocess.Popen(["konsole", "-e", *cmd], start_new_session=True)
        elif terminal in ("xfce4-terminal", "mate-terminal", "lxterminal"):
            subprocess.Popen([terminal, "-e", shlex.join(cmd)], start_new_session=True)
        else:
            subprocess.Popen([terminal, "-e", *cmd], start_new_session=True)
    except Exception:
        pass


# ── Panel states ──────────────────────────────────────────────────

EMPTY = 0
CREATING = 1
RUNNING = 2
ERROR = 3


# ── Terminal Panel ────────────────────────────────────────────────

class TerminalPanel(QFrame):
    """A single slot in the 2x2 grid.

    Lifecycle:  empty → creating → running (shell attached) → killed/closed.
    """

    create_requested = Signal(int)
    state_changed = Signal()

    def __init__(self, slot_index: int, parent=None):
        super().__init__(parent)
        self.slot_index = slot_index
        self.container_name: str | None = None
        self.worker = None
        self._shell_worker = None
        self.state = EMPTY
        self._elapsed = 0
        self._timer = QTimer(self)
        self._timer.timeout.connect(self._tick)

        self.setObjectName("terminalPanel")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        self._stack = QStackedWidget()
        layout.addWidget(self._stack)

        self._build_empty_page()
        self._build_active_page()
        self._stack.setCurrentIndex(0)

    # ── page builders ─────────────────────────────────────────────

    def _build_empty_page(self):
        page = QWidget()
        page.setCursor(Qt.CursorShape.PointingHandCursor)
        lay = QVBoxLayout(page)
        lay.setAlignment(Qt.AlignmentFlag.AlignCenter)

        icon = QLabel("+")
        icon.setObjectName("placeholderIcon")
        icon.setAlignment(Qt.AlignmentFlag.AlignCenter)

        title = QLabel("Create Container")
        title.setObjectName("placeholderText")
        title.setAlignment(Qt.AlignmentFlag.AlignCenter)

        sub = QLabel("Click to spin up a new dev environment")
        sub.setObjectName("placeholderSubtext")
        sub.setAlignment(Qt.AlignmentFlag.AlignCenter)

        lay.addWidget(icon)
        lay.addWidget(title)
        lay.addWidget(sub)

        page.mousePressEvent = lambda _ev: self.create_requested.emit(self.slot_index)
        self._stack.addWidget(page)

    def _build_active_page(self):
        page = QWidget()
        lay = QVBoxLayout(page)
        lay.setContentsMargins(0, 0, 0, 0)
        lay.setSpacing(0)

        # header
        header = QFrame()
        header.setObjectName("terminalHeader")
        hl = QHBoxLayout(header)
        hl.setContentsMargins(12, 8, 12, 8)

        self._name_label = QLabel("Container")
        self._name_label.setObjectName("headerName")

        self._status_label = QLabel("")
        self._status_label.setObjectName("headerStatus")

        self._time_label = QLabel("0:00")
        self._time_label.setObjectName("headerTime")

        self._cancel_btn = QPushButton("Cancel")
        self._cancel_btn.setObjectName("cancelBtn")
        self._cancel_btn.clicked.connect(self._on_cancel)
        self._cancel_btn.setVisible(False)

        hl.addWidget(self._name_label)
        hl.addStretch()
        hl.addWidget(self._status_label)
        hl.addWidget(self._time_label)
        hl.addWidget(self._cancel_btn)
        lay.addWidget(header)

        # terminal output / input
        self._output = TerminalWidget()
        self._output.setObjectName("terminalOutput")
        lay.addWidget(self._output, 1)

        # action bar
        self._action_bar = QFrame()
        self._action_bar.setObjectName("actionBar")
        al = QHBoxLayout(self._action_bar)
        al.setContentsMargins(8, 6, 8, 6)

        self._shell_btn = QPushButton("New Shell")
        self._shell_btn.setObjectName("actionBtn")
        self._shell_btn.setToolTip("Open an additional shell in an external terminal")
        self._code_btn = QPushButton("Code")
        self._code_btn.setObjectName("actionBtn")
        self._claude_btn = QPushButton("Claude")
        self._claude_btn.setObjectName("actionBtn")
        self._kill_btn = QPushButton("Kill")
        self._kill_btn.setObjectName("killBtn")
        self._close_btn = QPushButton("Close")
        self._close_btn.setObjectName("closeBtn")

        self._shell_btn.clicked.connect(self._on_shell)
        self._code_btn.clicked.connect(self._on_code)
        self._claude_btn.clicked.connect(self._on_claude)
        self._kill_btn.clicked.connect(self._on_kill)
        self._close_btn.clicked.connect(self._on_close)

        al.addWidget(self._shell_btn)
        al.addWidget(self._code_btn)
        al.addWidget(self._claude_btn)
        al.addStretch()
        al.addWidget(self._kill_btn)
        al.addWidget(self._close_btn)

        self._action_bar.setVisible(False)
        lay.addWidget(self._action_bar)

        self._stack.addWidget(page)

    # ── public API ────────────────────────────────────────────────

    def start_creation(self, display_name: str, worker):
        self.container_name = None
        self.worker = worker
        self._shell_worker = None
        self.state = CREATING
        self._elapsed = 0

        self._name_label.setText(display_name)
        self._set_status("Creating\u2026", COLORS["yellow"])
        self._time_label.setText("0:00")
        self._cancel_btn.setVisible(True)
        self._action_bar.setVisible(False)
        self._output.clear()

        self._stack.setCurrentIndex(1)

        worker.output_received.connect(self._on_output)
        worker.creation_finished.connect(self._on_finished)

        self._timer.start(1000)
        worker.start()

    def is_active(self) -> bool:
        return self.state != EMPTY

    def reset(self):
        self._stop_shell()

        if self.worker and self.worker.isRunning():
            self.worker.requestInterruption()
            self.worker.wait(3000)

        self._output.set_interactive(False)
        self._output.clear()

        self.container_name = None
        self.worker = None
        self.state = EMPTY
        self._elapsed = 0
        self._timer.stop()

        self._action_bar.setVisible(False)
        self._cancel_btn.setVisible(False)
        self._shell_btn.setVisible(True)
        self._code_btn.setVisible(True)
        self._claude_btn.setVisible(True)
        self._kill_btn.setVisible(True)

        self._stack.setCurrentIndex(0)
        self.state_changed.emit()

    # ── internal slots ────────────────────────────────────────────

    def _set_status(self, text: str, color: str):
        self._status_label.setText(text)
        self._status_label.setStyleSheet(f"color: {color};")

    def _tick(self):
        self._elapsed += 1
        m, s = divmod(self._elapsed, 60)
        self._time_label.setText(f"{m}:{s:02d}")

    def _on_output(self, text: str):
        self._output.append_ansi(text)

    def _on_finished(self, exit_code: int):
        self._timer.stop()
        self._cancel_btn.setVisible(False)

        if exit_code == 0:
            self.state = RUNNING
            self._set_status("Running", COLORS["green"])
            self._action_bar.setVisible(True)

            from fluid.config import CONTAINER_PREFIX, load_state

            state = load_state()
            if state.current:
                self.container_name = state.current
                self._name_label.setText(
                    state.current.removeprefix(f"{CONTAINER_PREFIX}-")
                )

            self._start_shell()
        else:
            self.state = ERROR
            self._set_status("Error", COLORS["red"])
            self._action_bar.setVisible(True)
            self._shell_btn.setVisible(False)
            self._code_btn.setVisible(False)
            self._claude_btn.setVisible(False)
            self._kill_btn.setVisible(False)

        self.state_changed.emit()

    def _on_cancel(self):
        if self.worker and self.worker.isRunning():
            self.worker.requestInterruption()

    # ── shell session ─────────────────────────────────────────────

    def _start_shell(self):
        if not self.container_name:
            return

        from fluid.gui.workers import ShellSessionWorker

        self._shell_worker = ShellSessionWorker(self.container_name)
        self._shell_worker.output_received.connect(self._on_shell_output)
        self._shell_worker.session_ended.connect(self._on_shell_ended)

        self._output.set_interactive(True)
        self._output.input_signal.connect(self._on_shell_input)

        self._shell_worker.start()

    def _stop_shell(self):
        if self._shell_worker and self._shell_worker.isRunning():
            self._shell_worker.requestInterruption()
            self._shell_worker.wait(3000)
        self._shell_worker = None
        try:
            self._output.input_signal.disconnect(self._on_shell_input)
        except RuntimeError:
            pass

    def _on_shell_output(self, text: str):
        self._output.feed(text)

    def _on_shell_input(self, data: bytes):
        if self._shell_worker:
            self._shell_worker.write_input(data)

    def _on_shell_ended(self, exit_code: int):
        self._output.set_interactive(False)
        self._output.append_ansi(
            f"\r\n\x1b[33m[Shell exited with code {exit_code}. "
            f"Press Kill to remove the container or Close to free this slot.]\x1b[0m\r\n"
        )
        self._shell_worker = None

    # ── action handlers ───────────────────────────────────────────

    def _on_shell(self):
        if not self.container_name:
            return
        terminal = _find_terminal()
        if terminal:
            _run_in_terminal(
                terminal,
                ["docker", "exec", "-it", self.container_name, "/bin/bash"],
            )

    def _on_code(self):
        if not self.container_name:
            return
        try:
            from fluid.docker_manager import open_in_editor
            open_in_editor(self.container_name)
        except SystemExit:
            pass

    def _on_claude(self):
        if not self.container_name:
            return
        from fluid.config import load_config
        config = load_config()
        cmd: list[str] = ["docker", "exec", "-it"]
        for key, val in config.env_vars().items():
            cmd.extend(["-e", f"{key}={val}"])
        cmd.extend([self.container_name, "claude"])

        terminal = _find_terminal()
        if terminal:
            _run_in_terminal(terminal, cmd)

    def _on_kill(self):
        if not self.container_name:
            self.reset()
            return
        self._stop_shell()
        try:
            from fluid.docker_manager import kill_container
            kill_container(self.container_name)
        except SystemExit:
            pass
        self.reset()

    def _on_close(self):
        self.reset()
