"""Container creation dialog."""

from __future__ import annotations

from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
)

from fluid.config import DEFAULT_ROCM_VERSION, SUPPORTED_DISTROS


class CreateContainerDialog(QDialog):
    """Modal dialog for specifying new container parameters."""

    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Create Container")
        self.setMinimumWidth(440)
        self.setWindowFlags(
            self.windowFlags() & ~Qt.WindowType.WindowContextHelpButtonHint
        )

        layout = QVBoxLayout(self)
        layout.setSpacing(16)

        heading = QLabel("New ROCm Container")
        heading.setStyleSheet("font-size: 16px; font-weight: bold;")
        layout.addWidget(heading)

        form = QFormLayout()
        form.setSpacing(10)

        self._version_input = QLineEdit(
            DEFAULT_ROCM_VERSION if DEFAULT_ROCM_VERSION != "latest" else "6.3"
        )
        self._version_input.setPlaceholderText("e.g. 6.3, 6.2.4, latest")
        form.addRow("ROCm Version:", self._version_input)

        self._name_input = QLineEdit()
        self._name_input.setPlaceholderText("Optional – auto-generated if empty")
        form.addRow("Name:", self._name_input)

        self._distro_combo = QComboBox()
        self._distro_combo.addItems(list(SUPPORTED_DISTROS))
        form.addRow("Distro:", self._distro_combo)

        ws_layout = QHBoxLayout()
        self._workspace_input = QLineEdit()
        self._workspace_input.setPlaceholderText("Defaults to current directory")
        browse_btn = QPushButton("Browse")
        browse_btn.setObjectName("cancelDialogBtn")
        browse_btn.clicked.connect(self._browse)
        ws_layout.addWidget(self._workspace_input, 1)
        ws_layout.addWidget(browse_btn)
        form.addRow("Workspace:", ws_layout)

        self._force_check = QCheckBox(
            "Force creation (ignore compatibility errors)"
        )
        form.addRow("", self._force_check)

        layout.addLayout(form)

        # buttons
        btn_layout = QHBoxLayout()
        btn_layout.addStretch()

        cancel_btn = QPushButton("Cancel")
        cancel_btn.setObjectName("cancelDialogBtn")
        cancel_btn.clicked.connect(self.reject)

        create_btn = QPushButton("Create")
        create_btn.setObjectName("createDialogBtn")
        create_btn.setDefault(True)
        create_btn.clicked.connect(self._on_create)

        btn_layout.addWidget(cancel_btn)
        btn_layout.addWidget(create_btn)
        layout.addLayout(btn_layout)

    # ── slots ─────────────────────────────────────────────────────

    def _browse(self):
        d = QFileDialog.getExistingDirectory(self, "Select Workspace Directory")
        if d:
            self._workspace_input.setText(d)

    def _on_create(self):
        version = self._version_input.text().strip()
        if not version:
            self._version_input.setFocus()
            return
        self.accept()

    # ── result ────────────────────────────────────────────────────

    def get_params(self) -> dict:
        return {
            "version": self._version_input.text().strip(),
            "name": self._name_input.text().strip() or None,
            "distro": self._distro_combo.currentText(),
            "workspace": self._workspace_input.text().strip() or None,
            "force": self._force_check.isChecked(),
        }
