from __future__ import annotations

from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import (
    QFontComboBox,
    QFormLayout,
    QGroupBox,
    QSpinBox,
    QVBoxLayout,
    QWidget,
)

from ...core.config import Config


class SettingsTab(QWidget):
    def __init__(self, config: Config, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.config = config
        self.init_ui()
        self.load_from_config()

    def init_ui(self) -> None:
        root_layout = QVBoxLayout(self)

        font_group = QGroupBox("Görünüm")
        layout = QFormLayout(font_group)

        self.font_family = QFontComboBox()
        self.font_size = QSpinBox()
        self.font_size.setRange(8, 24)

        layout.addRow("Yazı Tipi", self.font_family)
        layout.addRow("Yazı Boyutu", self.font_size)
        root_layout.addWidget(font_group)
        root_layout.addStretch(1)

        self.font_family.currentFontChanged.connect(self.save_font_settings)
        self.font_size.valueChanged.connect(self.save_font_settings)

    def load_from_config(self) -> None:
        font_family = self.config.get(["ui", "font_family"], "")
        font_size = int(self.config.get(["ui", "font_size"], 10))
        if font_family:
            self.font_family.setCurrentFont(QFont(font_family))
        self.font_size.setValue(font_size)

    def save_font_settings(self) -> None:
        self.config.set(["ui", "font_family"], self.font_family.currentFont().family())
        self.config.set(["ui", "font_size"], int(self.font_size.value()))
