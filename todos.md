# Phase 2: Jüri/Ödül Töreni Modülü - Technical Tasks

## Completed (Phase 1)
- [x] Update FRC inspection type constants
- [x] Update inspection settings API
- [x] Update default config
- [x] Update inspection type checkboxes
- [x] Update type filter dropdown
- [x] Add status color CSS

---

## Day 1: Backend & Database

### Task 1: Update awards.js presets for TG (Tasarla Geliştir)
- [ ] Update `awardPresets` constant in `static/js/awards.js`
  - Replace FTC awards with 11 TG awards from juri docs
  - Add category: "Jüri Değerlendirmeli" or "Robot Performansı"
  - Add descriptions from juri docs

### Task 2: Create award_winners storage
- [ ] Add `award_winners` table schema in `src/core/storage/base.py`
  - id, event_id, award_name, winner_team_number, winner_team_name
  - jury_note, presentation_order, announced, created_at
- [ ] Create migration for existing databases

### Task 3: Create award winners API endpoints
- [ ] Add `/api/award-winners` GET endpoint in `app_web.py`
- [ ] Add `/api/award-winners` POST endpoint
- [ ] Add `/api/award-winners/<id>` DELETE endpoint
- [ ] Add `/api/public/award-winners` for audience display

### Task 4: Create ceremony state API
- [ ] Add `/api/ceremony/state` GET endpoint
- [ ] Add `/api/ceremony/start` POST endpoint
- [ ] Add `/api/ceremony/next` POST endpoint
- [ ] Add `/api/ceremony/show/<award_id>` POST endpoint
- [ ] Add `/api/ceremony/stop` POST endpoint

---

## Day 2: Jüri Paneli UI

### Task 5: Create jury_awards.js
- [ ] Create `static/js/jury_awards.js`
  - `loadAwardWinners()` function
  - `saveAwardWinner(awardId, teamNumber, juryNote)` function
  - `renderAwardWinnerForm(award)` function

### Task 6: Add Ödül Töreni tab to match_control.html
- [ ] Add new tab "Ödül Töreni" in match_control.html
- [ ] Create award winners management UI
  - Award list with winner dropdown
  - Jury note textarea for each award
  - Presentation order drag-drop or input

### Task 7: Add ceremony control panel
- [ ] Add ceremony control buttons
  - "Sunumu Başlat" button
  - "Sonraki Ödül" button
  - "Ödülü Göster" button (specific award)
  - "Sunumu Durdur" button
- [ ] Current award display indicator

---

## Day 3: Audience Display & Animations

### Task 8: Update audience_display.html for ceremony view
- [ ] Add `audience_ceremony_view` section
  - Award presentation container
  - Award name element (large, animated)
  - Award description element
  - Winner reveal section (team number + name)
  - Jury note section
  - All winners list section

### Task 9: Create audience_ceremony.js
- [ ] Create ceremony state management
- [ ] Create presentation animations (CSS + JS)
  - fadeIn, scaleUp, spotlightReveal
- [ ] Create SSE listener for ceremony events
- [ ] Create transition functions between awards

### Task 10: Add ceremony CSS animations
- [ ] Add `.ceremony-*` CSS classes in style.css
  - `.ceremony-award-enter` - fade in from top
  - `.ceremony-winner-reveal` - scale up with glow
  - `.ceremony-jury-note` - fade in from bottom
  - `.ceremony-spotlight` - radial gradient spotlight

---

## Day 4: Integration & Testing

### Task 11: Update audience view selector
- [ ] Add "ceremony" option to screen view selector
- [ ] Update screen settings API for ceremony view

### Task 12: Test ceremony flow
- [ ] Test single award presentation
- [ ] Test sequential award presentation
- [ ] Test animation timing
- [ ] Test SSE synchronization across multiple screens

### Task 13: Documentation
- [ ] Update API documentation
- [ ] Create user guide for ceremony mode

  - `renderChecklistItems(checklist, container)` function
  - Item structure: checkbox, label, status buttons, notes input
  - Accordion/collapsible sections (if multiple categories)
- [ ] Add checklist item interaction handlers
  - Pass/Fail/N/A button click → update item status
  - Notes input blur → update item notes
  - Calculate overall status on each change
- [ ] Add checklist save functionality
  - "Kaydet" button → collect all checklist data
  - PUT /api/inspection-slots/<id> with updated notes JSON
  - Update local UI (close modal, refresh table)
  - Show toast notification

### Integration: Connect Checklist to Inspection Slots
- [ ] Update `loadInspectionSlots()` in `static/js/inspection.js`
  - Add "Checklist" button/icon to each row
  - Parse notes field as JSON (if valid)
  - Show checklist summary (X/Y items passed)
- [ ] Update slot row click handler
  - Open checklist modal when "Checklist" button clicked
  - Pass slot data to modal
- [ ] Update `createInspectionSlot()` function
  - Initialize notes with empty checklist template
  - Use `generateChecklistTemplate(inspectionType)`
- [ ] Update `generateInspectionSlots()` function
  - Initialize checklist for each auto-generated slot
  - Set initial status to "scheduled"

### Status Color Coding
- [ ] Add CSS classes for status colors in `static/style.css`
  - `.status-passed` → green background
  - `.status-failed` → red background
  - `.status-passed-with-conditions` → yellow background
  - `.status-pending-reinspection` → orange background
  - `.status-in-progress` → blue background
  - `.status-cancelled`, `.status-no-show` → gray background
- [ ] Update `loadInspectionSlots()` to apply status colors
  - Add status class to table rows
  - Update status dropdown styling
- [ ] Update `renderInspectionGrid()` to apply status colors
  - Add status class to grid cells
  - Update cell background colors

## Day 3: Print & Refinements

### Print Template Enhancement
- [ ] Update `printInspectionSchedule()` in `static/js/inspection.js`
  - Add checklist summary column to print table
  - Show pass/fail/na counts for each slot
  - Add optional "Detailed Checklist" section (toggle)
- [ ] Update print styles in `printInspectionSchedule()`
  - Format checklist items for print
  - Add page breaks if needed
  - Ensure status colors print correctly

### Testing & Bug Fixes
- [ ] Test inspection type selection (all 10 types)
  - Checkbox selection → save → reload → verify persistence
- [ ] Test automatic schedule generation with FRC types
  - Select multiple types → generate → verify correct slots created
  - Verify checklist initialized for each slot
- [ ] Test checklist modal
  - Open modal → fill checklist → save → verify saved
  - Reopen modal → verify checklist loaded correctly
- [ ] Test status color coding
  - Change status → verify color updates (list view)
  - Change status → verify color updates (grid view)
- [ ] Test print functionality
  - Print with checklist summary → verify output
  - Check PDF export quality
- [ ] Test backward compatibility
  - Load old slots (no checklist) → should not crash
  - Old slots should display normally

### Documentation
- [ ] Add code comments for new functions
  - Document checklist JSON structure
  - Document status color mapping
  - Document checklist calculation logic
- [ ] Update `AGENT_LOG.md` with Phase 1 changes
  - List all new features
  - List modified files
  - Include checklist JSON schema
- [ ] Create user guide section (optional)
  - How to configure FRC types
  - How to use checklist modal
  - How to interpret status colors

## Optional Enhancements (If Time Permits)

### Advanced Features
- [ ] Add checklist template library
  - Predefined templates for each FRC type
  - Load template from dropdown
  - Customize template per event
- [ ] Add bulk checklist operations
  - Copy checklist from one slot to another
  - Apply template to multiple slots
- [ ] Add inspector signature field
  - Text input or digital signature canvas
  - Store in checklist data
  - Display in print output
- [ ] Add timestamp tracking
  - Record when each checklist item was checked
  - Show in detailed view
- [ ] Add photo upload support (Phase 2 preview)
  - Add file input to checklist items
  - Store file paths or base64 data
  - Display thumbnails in checklist modal

## Rollback Plan (If Issues Arise)

### Safety Measures
- [ ] Git commit before each major change
  - Commit message format: "feat: [Phase1] <description>"
- [ ] Test each feature independently
  - Don't merge multiple features without testing
- [ ] Keep old code as comments (temporarily)
  - Easy to revert if needed
- [ ] Database backup before any schema changes
  - `cp src/resources/data.db src/resources/data.db.backup`
