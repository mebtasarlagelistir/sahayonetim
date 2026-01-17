from pathlib import Path

from PyQt6.QtGui import QFont
from PyQt6.QtWidgets import QApplication

from src.core.config import Config
from src.core.event_setup import default_config_dict
from src.core.storage import DataStore
from src.gui.main_window import MainWindow


def load_stylesheet(base_path: Path) -> str:
    qss_path = base_path / "src" / "resources" / "style.qss"
    if qss_path.exists():
        return qss_path.read_text(encoding="utf-8")
    return ""


def main() -> None:
    base_path = Path(__file__).resolve().parent
    config = Config(base_path=base_path)
    if not config.data or "event" not in config.data:
        config.data = default_config_dict()
        config.save()

    datastore = DataStore(base_path=base_path)
    datastore.migrate_from_config(config.data)

    app = QApplication([])
    stylesheet = load_stylesheet(base_path)
    if stylesheet:
        app.setStyleSheet(stylesheet)

    font_family = config.get(["ui", "font_family"], "")
    font_size = int(config.get(["ui", "font_size"], 10))
    if font_family:
        app.setFont(QFont(font_family, font_size))
    else:
        app.setFont(QFont(app.font().family(), font_size))

    window = MainWindow(config, datastore)
    window.resize(1100, 800)
    window.show()
    app.exec()


if __name__ == "__main__":
    main()
