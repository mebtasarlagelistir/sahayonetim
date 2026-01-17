from __future__ import annotations

from PyQt6.QtCore import QDate
from PyQt6.QtWidgets import (
    QCheckBox,
    QDateEdit,
    QFormLayout,
    QGroupBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QScrollArea,
    QSpinBox,
    QTableWidget,
    QTableWidgetItem,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ...core.config import Config
from ...core.storage import DataStore


class EventSetupTab(QWidget):
    def __init__(
        self, config: Config, datastore: DataStore, parent: QWidget | None = None
    ) -> None:
        super().__init__(parent)
        self.config = config
        self.datastore = datastore
        self.loading = False
        self.event_data: dict = {}
        self.init_ui()
        self.load_from_store()

    def init_ui(self) -> None:
        root_layout = QVBoxLayout(self)
        scroll = QScrollArea()
        scroll.setWidgetResizable(True)
        content = QWidget()
        content_layout = QVBoxLayout(content)

        content_layout.addWidget(self._build_event_group())
        content_layout.addWidget(self._build_location_group())
        content_layout.addWidget(self._build_organizer_group())
        content_layout.addWidget(self._build_format_group())
        content_layout.addWidget(self._build_schedule_group())
        content_layout.addWidget(self._build_scoring_group())
        content_layout.addWidget(self._build_teams_group())
        content_layout.addWidget(self._build_custom_fields_group())
        content_layout.addStretch(1)

        scroll.setWidget(content)
        root_layout.addWidget(scroll)

    def _build_event_group(self) -> QGroupBox:
        group = QGroupBox("Etkinlik Bilgileri")
        layout = QFormLayout(group)

        self.event_name = QLineEdit()
        self.event_code = QLineEdit()
        self.season = QLineEdit()

        self.start_date = QDateEdit()
        self.start_date.setCalendarPopup(True)
        self.end_date = QDateEdit()
        self.end_date.setCalendarPopup(True)

        self.timezone = QLineEdit()

        layout.addRow("Etkinlik Adı", self.event_name)
        layout.addRow("Etkinlik Kodu", self.event_code)
        layout.addRow("Sezon", self.season)
        layout.addRow("Başlangıç Tarihi", self.start_date)
        layout.addRow("Bitiş Tarihi", self.end_date)
        layout.addRow("Zaman Dilimi", self.timezone)

        self.event_name.editingFinished.connect(self.save_event_fields)
        self.event_code.editingFinished.connect(self.save_event_fields)
        self.season.editingFinished.connect(self.save_event_fields)
        self.start_date.dateChanged.connect(self.save_event_fields)
        self.end_date.dateChanged.connect(self.save_event_fields)
        self.timezone.editingFinished.connect(self.save_event_fields)

        return group

    def _build_location_group(self) -> QGroupBox:
        group = QGroupBox("Konum")
        layout = QFormLayout(group)

        self.venue = QLineEdit()
        self.city = QLineEdit()
        self.country = QLineEdit()

        layout.addRow("Mekan", self.venue)
        layout.addRow("Şehir", self.city)
        layout.addRow("Ülke", self.country)

        self.venue.editingFinished.connect(self.save_location_fields)
        self.city.editingFinished.connect(self.save_location_fields)
        self.country.editingFinished.connect(self.save_location_fields)
        return group

    def _build_organizer_group(self) -> QGroupBox:
        group = QGroupBox("Organizasyon")
        layout = QFormLayout(group)

        self.org_name = QLineEdit()
        self.contact_name = QLineEdit()
        self.contact_email = QLineEdit()
        self.contact_phone = QLineEdit()

        layout.addRow("Kurum", self.org_name)
        layout.addRow("Yetkili Kişi", self.contact_name)
        layout.addRow("E-posta", self.contact_email)
        layout.addRow("Telefon", self.contact_phone)

        self.org_name.editingFinished.connect(self.save_organizer_fields)
        self.contact_name.editingFinished.connect(self.save_organizer_fields)
        self.contact_email.editingFinished.connect(self.save_organizer_fields)
        self.contact_phone.editingFinished.connect(self.save_organizer_fields)
        return group

    def _build_format_group(self) -> QGroupBox:
        group = QGroupBox("Format")
        layout = QFormLayout(group)

        self.divisions = QLineEdit()
        self.fields = QSpinBox()
        self.fields.setRange(1, 12)
        self.teams_per_alliance = QSpinBox()
        self.teams_per_alliance.setRange(1, 4)
        self.alliances = QSpinBox()
        self.alliances.setRange(2, 4)

        layout.addRow("Kategoriler (virgüllü)", self.divisions)
        layout.addRow("Saha Sayısı", self.fields)
        layout.addRow("İttifak Başına Takım", self.teams_per_alliance)
        layout.addRow("İttifak Sayısı", self.alliances)

        self.divisions.editingFinished.connect(self.save_format_fields)
        self.fields.valueChanged.connect(self.save_format_fields)
        self.teams_per_alliance.valueChanged.connect(self.save_format_fields)
        self.alliances.valueChanged.connect(self.save_format_fields)
        return group

    def _build_schedule_group(self) -> QGroupBox:
        group = QGroupBox("Maç Süreleri")
        layout = QFormLayout(group)

        self.auto_seconds = QSpinBox()
        self.auto_seconds.setRange(0, 300)
        self.teleop_seconds = QSpinBox()
        self.teleop_seconds.setRange(0, 300)
        self.endgame_seconds = QSpinBox()
        self.endgame_seconds.setRange(0, 300)
        self.match_cycle_seconds = QSpinBox()
        self.match_cycle_seconds.setRange(0, 600)

        layout.addRow("OKS (sn)", self.auto_seconds)
        layout.addRow("SKS (sn)", self.teleop_seconds)
        layout.addRow("Endgame (sn)", self.endgame_seconds)
        layout.addRow("Toplam Döngü (sn)", self.match_cycle_seconds)

        self.auto_seconds.valueChanged.connect(self.save_schedule_fields)
        self.teleop_seconds.valueChanged.connect(self.save_schedule_fields)
        self.endgame_seconds.valueChanged.connect(self.save_schedule_fields)
        self.match_cycle_seconds.valueChanged.connect(self.save_schedule_fields)
        return group

    def _build_scoring_group(self) -> QGroupBox:
        group = QGroupBox("Skorlama")
        layout = QVBoxLayout(group)

        self.allow_remote_scoring = QCheckBox("Hakem masası dışında puan girişi")
        self.scoring_notes = QTextEdit()
        self.scoring_notes.setPlaceholderText("Notlar / esnek kurallar...")

        layout.addWidget(self.allow_remote_scoring)
        layout.addWidget(QLabel("Notlar"))
        layout.addWidget(self.scoring_notes)

        self.allow_remote_scoring.stateChanged.connect(self.save_scoring_fields)
        self.scoring_notes.textChanged.connect(self.save_scoring_fields)
        return group

    def _build_teams_group(self) -> QGroupBox:
        group = QGroupBox("Takımlar")
        layout = QVBoxLayout(group)

        self.teams_table = QTableWidget(0, 5)
        self.teams_table.setHorizontalHeaderLabels(
            ["Takım No", "Takım Adı", "Okul", "Şehir", "Kategori"]
        )
        self.teams_table.cellChanged.connect(self.save_teams)

        buttons_layout = QHBoxLayout()
        add_button = QPushButton("Takım Ekle")
        remove_button = QPushButton("Seçili Takımı Sil")
        add_button.clicked.connect(self.add_team_row)
        remove_button.clicked.connect(self.remove_team_row)
        buttons_layout.addWidget(add_button)
        buttons_layout.addWidget(remove_button)
        buttons_layout.addStretch(1)

        layout.addWidget(self.teams_table)
        layout.addLayout(buttons_layout)
        return group

    def _build_custom_fields_group(self) -> QGroupBox:
        group = QGroupBox("Esnek Alanlar")
        layout = QVBoxLayout(group)

        self.custom_table = QTableWidget(0, 2)
        self.custom_table.setHorizontalHeaderLabels(["Anahtar", "Değer"])
        self.custom_table.cellChanged.connect(self.save_custom_fields)

        buttons_layout = QHBoxLayout()
        add_button = QPushButton("Alan Ekle")
        remove_button = QPushButton("Seçili Alanı Sil")
        add_button.clicked.connect(self.add_custom_row)
        remove_button.clicked.connect(self.remove_custom_row)
        buttons_layout.addWidget(add_button)
        buttons_layout.addWidget(remove_button)
        buttons_layout.addStretch(1)

        layout.addWidget(self.custom_table)
        layout.addLayout(buttons_layout)
        return group

    def load_from_store(self) -> None:
        self.loading = True
        event = self.datastore.get_event()
        self.event_data = event
        location = event.get("location", {})
        dates = event.get("dates", {})
        organizer = event.get("organizer", {})
        format_data = event.get("format", {})
        schedule = event.get("schedule", {})
        scoring = event.get("scoring", {})

        self.event_name.setText(event.get("name", ""))
        self.event_code.setText(event.get("code", ""))
        self.season.setText(event.get("season", ""))

        self.start_date.setDate(self._parse_date(dates.get("start")))
        self.end_date.setDate(self._parse_date(dates.get("end")))
        self.timezone.setText(dates.get("timezone", "Europe/Istanbul"))

        self.venue.setText(location.get("venue", ""))
        self.city.setText(location.get("city", ""))
        self.country.setText(location.get("country", "TR"))

        self.org_name.setText(organizer.get("organization", ""))
        self.contact_name.setText(organizer.get("contact_name", ""))
        self.contact_email.setText(organizer.get("email", ""))
        self.contact_phone.setText(organizer.get("phone", ""))

        divisions = format_data.get("divisions", ["Genel"])
        self.divisions.setText(", ".join(divisions))
        self.fields.setValue(int(format_data.get("fields", 1)))
        self.teams_per_alliance.setValue(int(format_data.get("teams_per_alliance", 2)))
        self.alliances.setValue(int(format_data.get("alliances", 2)))

        self.auto_seconds.setValue(int(schedule.get("auto_seconds", 0)))
        self.teleop_seconds.setValue(int(schedule.get("teleop_seconds", 120)))
        self.endgame_seconds.setValue(int(schedule.get("endgame_seconds", 30)))
        self.match_cycle_seconds.setValue(int(schedule.get("match_cycle_seconds", 150)))

        self.allow_remote_scoring.setChecked(
            bool(scoring.get("allow_remote_scoring", False))
        )
        self.scoring_notes.setPlainText(scoring.get("notes", ""))

        teams = self.datastore.get_teams()
        self._load_teams_table(teams)

        custom_fields = event.get("custom_fields", [])
        self._load_custom_table(custom_fields)
        self.loading = False

    def save_event_fields(self) -> None:
        if self.loading:
            return
        self.event_data["name"] = self.event_name.text().strip()
        self.event_data["code"] = self.event_code.text().strip()
        self.event_data["season"] = self.season.text().strip()
        self.event_data.setdefault("dates", {})
        self.event_data["dates"]["start"] = self.start_date.date().toString("yyyy-MM-dd")
        self.event_data["dates"]["end"] = self.end_date.date().toString("yyyy-MM-dd")
        self.event_data["dates"]["timezone"] = self.timezone.text().strip()
        self.datastore.save_event(self.event_data)

    def save_location_fields(self) -> None:
        if self.loading:
            return
        self.event_data.setdefault("location", {})
        self.event_data["location"]["venue"] = self.venue.text().strip()
        self.event_data["location"]["city"] = self.city.text().strip()
        self.event_data["location"]["country"] = self.country.text().strip()
        self.datastore.save_event(self.event_data)

    def save_organizer_fields(self) -> None:
        if self.loading:
            return
        self.event_data.setdefault("organizer", {})
        self.event_data["organizer"]["organization"] = self.org_name.text().strip()
        self.event_data["organizer"]["contact_name"] = self.contact_name.text().strip()
        self.event_data["organizer"]["email"] = self.contact_email.text().strip()
        self.event_data["organizer"]["phone"] = self.contact_phone.text().strip()
        self.datastore.save_event(self.event_data)

    def save_format_fields(self) -> None:
        if self.loading:
            return
        divisions = [item.strip() for item in self.divisions.text().split(",") if item.strip()]
        if not divisions:
            divisions = ["Genel"]
        self.event_data.setdefault("format", {})
        self.event_data["format"]["divisions"] = divisions
        self.event_data["format"]["fields"] = int(self.fields.value())
        self.event_data["format"]["teams_per_alliance"] = int(self.teams_per_alliance.value())
        self.event_data["format"]["alliances"] = int(self.alliances.value())
        self.datastore.save_event(self.event_data)

    def save_schedule_fields(self) -> None:
        if self.loading:
            return
        self.event_data.setdefault("schedule", {})
        self.event_data["schedule"]["auto_seconds"] = int(self.auto_seconds.value())
        self.event_data["schedule"]["teleop_seconds"] = int(self.teleop_seconds.value())
        self.event_data["schedule"]["endgame_seconds"] = int(self.endgame_seconds.value())
        self.event_data["schedule"]["match_cycle_seconds"] = int(
            self.match_cycle_seconds.value()
        )
        self.datastore.save_event(self.event_data)

    def save_scoring_fields(self) -> None:
        if self.loading:
            return
        self.event_data.setdefault("scoring", {})
        self.event_data["scoring"]["allow_remote_scoring"] = bool(
            self.allow_remote_scoring.isChecked()
        )
        self.event_data["scoring"]["notes"] = self.scoring_notes.toPlainText().strip()
        self.datastore.save_event(self.event_data)

    def _load_teams_table(self, teams: list[dict]) -> None:
        self.teams_table.blockSignals(True)
        self.teams_table.setRowCount(0)
        for team in teams:
            row = self.teams_table.rowCount()
            self.teams_table.insertRow(row)
            self.teams_table.setItem(row, 0, QTableWidgetItem(str(team.get("number", ""))))
            self.teams_table.setItem(row, 1, QTableWidgetItem(team.get("name", "")))
            self.teams_table.setItem(row, 2, QTableWidgetItem(team.get("school", "")))
            self.teams_table.setItem(row, 3, QTableWidgetItem(team.get("city", "")))
            self.teams_table.setItem(row, 4, QTableWidgetItem(team.get("category", "")))
        self.teams_table.blockSignals(False)

    def add_team_row(self) -> None:
        row = self.teams_table.rowCount()
        self.teams_table.insertRow(row)
        for col in range(5):
            self.teams_table.setItem(row, col, QTableWidgetItem(""))
        self.save_teams()

    def remove_team_row(self) -> None:
        row = self.teams_table.currentRow()
        if row >= 0:
            self.teams_table.removeRow(row)
            self.save_teams()

    def save_teams(self) -> None:
        if self.loading:
            return
        teams = []
        for row in range(self.teams_table.rowCount()):
            teams.append(
                {
                    "number": self._item_text(self.teams_table, row, 0),
                    "name": self._item_text(self.teams_table, row, 1),
                    "school": self._item_text(self.teams_table, row, 2),
                    "city": self._item_text(self.teams_table, row, 3),
                    "category": self._item_text(self.teams_table, row, 4),
                }
            )
        self.datastore.save_teams(teams)

    def _load_custom_table(self, fields: list[dict]) -> None:
        self.custom_table.blockSignals(True)
        self.custom_table.setRowCount(0)
        for field in fields:
            row = self.custom_table.rowCount()
            self.custom_table.insertRow(row)
            self.custom_table.setItem(row, 0, QTableWidgetItem(field.get("key", "")))
            self.custom_table.setItem(row, 1, QTableWidgetItem(field.get("value", "")))
        self.custom_table.blockSignals(False)

    def add_custom_row(self) -> None:
        row = self.custom_table.rowCount()
        self.custom_table.insertRow(row)
        self.custom_table.setItem(row, 0, QTableWidgetItem(""))
        self.custom_table.setItem(row, 1, QTableWidgetItem(""))
        self.save_custom_fields()

    def remove_custom_row(self) -> None:
        row = self.custom_table.currentRow()
        if row >= 0:
            self.custom_table.removeRow(row)
            self.save_custom_fields()

    def save_custom_fields(self) -> None:
        if self.loading:
            return
        fields = []
        for row in range(self.custom_table.rowCount()):
            key = self._item_text(self.custom_table, row, 0)
            value = self._item_text(self.custom_table, row, 1)
            if key or value:
                fields.append({"key": key, "value": value})
        self.event_data["custom_fields"] = fields
        self.datastore.save_event(self.event_data)

    @staticmethod
    def _item_text(table: QTableWidget, row: int, col: int) -> str:
        item = table.item(row, col)
        return item.text().strip() if item else ""

    @staticmethod
    def _parse_date(value: str | None) -> QDate:
        if value:
            date = QDate.fromString(value, "yyyy-MM-dd")
            if date.isValid():
                return date
        return QDate.currentDate()
