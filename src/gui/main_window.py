from __future__ import annotations

from PyQt6.QtWidgets import QMainWindow, QTabWidget

from .tabs.event_setup_tab import EventSetupTab
from .tabs.settings_tab import SettingsTab
from ..core.config import Config
from ..core.storage import DataStore


class MainWindow(QMainWindow):
    def __init__(self, config: Config, datastore: DataStore) -> None:
        super().__init__()
        self.config = config
        self.datastore = datastore
        self.init_ui()

    def init_ui(self) -> None:
        self.setWindowTitle("MEMSKOR - Etkinlik Kurulum")

        tabs = QTabWidget()
        tabs.addTab(EventSetupTab(self.config, self.datastore), "Etkinlik Kurulumu")
        tabs.addTab(SettingsTab(self.config), "Ayarlar")
        self.setCentralWidget(tabs)
