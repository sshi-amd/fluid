"""Background worker threads for container operations."""

from __future__ import annotations

import fcntl
import os
import pty
import select
import struct
import subprocess
import sys
import termios

from PySide6.QtCore import QThread, Signal


class _PtyWorker(QThread):
    """Base class: run a command inside a PTY, stream output, accept input."""

    output_received = Signal(str)

    def __init__(self):
        super().__init__()
        self._master_fd: int = -1
        self._process: subprocess.Popen | None = None

    # ── PTY lifecycle ─────────────────────────────────────────────

    def _run_in_pty(self, cmd: list[str], env: dict | None = None) -> int:
        master_fd, slave_fd = pty.openpty()

        try:
            winsize = struct.pack("HHHH", 40, 80, 0, 0)
            fcntl.ioctl(master_fd, termios.TIOCSWINSZ, winsize)
        except OSError:
            pass

        run_env = {**os.environ, "PYTHONUNBUFFERED": "1"}
        if env:
            run_env.update(env)

        self._master_fd = master_fd
        self._process = subprocess.Popen(
            cmd,
            stdin=slave_fd,
            stdout=slave_fd,
            stderr=slave_fd,
            close_fds=True,
            env=run_env,
        )
        os.close(slave_fd)

        try:
            self._read_loop()
        finally:
            try:
                os.close(master_fd)
            except OSError:
                pass
            self._master_fd = -1

        return self._process.wait() if self._process else 1

    def _read_loop(self):
        fd = self._master_fd
        while True:
            if self.isInterruptionRequested():
                if self._process:
                    self._process.terminate()
                break

            try:
                ready, _, _ = select.select([fd], [], [], 0.05)
            except (ValueError, OSError):
                break

            if ready:
                try:
                    data = os.read(fd, 4096)
                except OSError:
                    break
                if not data:
                    break
                self.output_received.emit(data.decode("utf-8", errors="replace"))

            if self._process and self._process.poll() is not None:
                self._drain()
                break

    def _drain(self):
        fd = self._master_fd
        while True:
            try:
                ready, _, _ = select.select([fd], [], [], 0.05)
            except (ValueError, OSError):
                break
            if not ready:
                break
            try:
                data = os.read(fd, 4096)
            except OSError:
                break
            if not data:
                break
            self.output_received.emit(data.decode("utf-8", errors="replace"))

    # ── input / resize (callable from any thread) ─────────────────

    def write_input(self, data: bytes):
        """Send keyboard data to the PTY.  Thread-safe for small writes."""
        fd = self._master_fd
        if fd >= 0:
            try:
                os.write(fd, data)
            except OSError:
                pass

    def resize_pty(self, rows: int, cols: int):
        fd = self._master_fd
        if fd >= 0:
            try:
                ws = struct.pack("HHHH", rows, cols, 0, 0)
                fcntl.ioctl(fd, termios.TIOCSWINSZ, ws)
            except OSError:
                pass


# ── Concrete workers ──────────────────────────────────────────────


class ContainerCreateWorker(_PtyWorker):
    """Run ``fluid create`` and emit exit code when done."""

    creation_finished = Signal(int)

    def __init__(
        self,
        version: str,
        name: str | None = None,
        workspace: str | None = None,
        distro: str = "ubuntu-22.04",
        force: bool = False,
    ):
        super().__init__()
        self.version = version
        self.name = name
        self.workspace = workspace
        self.distro = distro
        self.force = force

    def run(self):
        cmd = [
            sys.executable, "-m", "fluid",
            "create", "-v", self.version, "-d", self.distro,
        ]
        if self.name:
            cmd.extend(["-n", self.name])
        if self.workspace:
            cmd.extend(["-w", self.workspace])
        if self.force:
            cmd.append("--force")

        exit_code = self._run_in_pty(cmd)
        self.creation_finished.emit(exit_code)


class ShellSessionWorker(_PtyWorker):
    """Run an interactive bash shell inside a container."""

    session_ended = Signal(int)

    def __init__(self, container_name: str):
        super().__init__()
        self.container_name = container_name

    def run(self):
        cmd = ["docker", "exec", "-it", self.container_name, "/bin/bash"]
        exit_code = self._run_in_pty(cmd)
        self.session_ended.emit(exit_code)
