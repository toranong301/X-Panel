# V-Sheet mapping report

Generated: 2025-12-24T13:01:03.733Z

## Sheets
### Fr-01
- Note: looks dynamic (row pools detected)
- Formula cells: 3
- Candidate inputs: 178
- Input ranges (sample):
  - G4:H4
  - J4:J4
  - H9:J9
  - H10:J10
  - H11:J11
  - H12:J12
  - H13:J13
  - H14:J14
  - H15:J15
  - H16:J16
  - ... (44 more)
- Row pools:
  - Rows 9-21 step 1 columns H:J
  - Rows 27-29 step 1 columns G:J
  - Rows 36-42 step 1 columns A:J
  - Rows 43-45 step 1 columns A:F

### Fr-02
- Note: looks fixed
- Formula cells: 6
- Candidate inputs: 1
- Depends on: Fr-01
- Input ranges (sample):
  - M4:M4

### Fr-03.1
- Note: looks fixed
- Formula cells: 10
- Candidate inputs: 14
- Depends on: Fr-01
- Input ranges (sample):
  - M4:M4
  - A35:M35
- Monthly patterns:
  - Row 35: A35:L35

### Fr-03.2
- Note: looks dynamic (row pools detected)
- Formula cells: 18
- Candidate inputs: 494
- Depends on: Fr-01
- Input ranges (sample):
  - P4:P4
  - F19:I19
  - D20:N20
  - D22:N22
  - D23:N23
  - D24:N24
  - D25:K25
  - M25:N25
  - D26:K26
  - M26:N26
  - ... (95 more)
- Row pools:
  - Rows 22-24 step 1 columns D:N
  - Rows 25-32 step 1 columns D:N
  - Rows 35-38 step 1 columns C:N
  - Rows 40-46 step 1 columns C:N
  - Rows 52-55 step 1 columns C:N
  - Rows 55-59 step 2 columns C:N
  - Rows 63-65 step 1 columns C:N
  - Rows 70-72 step 1 columns A:K

### Fr-04.1
- Note: looks dynamic (row pools detected)
- Formula cells: 410
- Candidate inputs: 528
- Depends on: Fr-01
- Input ranges (sample):
  - AR4:AS4
  - B10:B10
  - B11:H11
  - U11:U11
  - Z11:Z11
  - B12:H12
  - U12:U12
  - Z12:Z12
  - B13:E13
  - X13:X13
  - ... (188 more)
- Monthly patterns:
  - Row 25: AB25:AM25
  - Row 26: AB26:AM26
  - Row 27: AB27:AM27
  - Row 28: AB28:AM28
  - Row 29: AB29:AM29
  - ... (8 more)
- Row pools:
  - Rows 17-21 step 1 columns B:Z
  - Rows 26-29 step 1 columns B:AR
  - Rows 39-41 step 1 columns B:AN
  - Rows 51-53 step 1 columns A:AR

### Fr-04.2
- Note: looks dynamic (row pools detected)
- Formula cells: 410
- Candidate inputs: 509
- Depends on: Fr-01
- Input ranges (sample):
  - AR4:AS4
  - B10:B10
  - B11:H11
  - U11:U11
  - Z11:Z11
  - B12:H12
  - U12:U12
  - Z12:Z12
  - B13:E13
  - X13:X13
  - ... (184 more)
- Monthly patterns:
  - Row 25: AB25:AM25
  - Row 26: AB26:AM26
  - Row 27: AB27:AM27
  - Row 28: AB28:AM28
  - Row 29: AB29:AM29
  - ... (7 more)
- Row pools:
  - Rows 17-19 step 1 columns B:Z
  - Rows 26-29 step 1 columns B:AR
  - Rows 38-41 step 1 columns B:AN
  - Rows 50-52 step 1 columns A:AR

### Fr-05
- Note: looks fixed
- Formula cells: 38
- Candidate inputs: 1
- Depends on: Fr-01, Fr-04.1, Fr-04.2
- Input ranges (sample):
  - J4:J4

### EF TGO AR4
- Note: looks fixed
- Formula cells: 127
- Candidate inputs: 0

### EF TGO AR5
- Note: looks fixed
- Formula cells: 152
- Candidate inputs: 0

### บันทึกการปรับปรุง
- Note: looks fixed
- Formula cells: 0
- Candidate inputs: 0

## Dependency graph
- Fr-02 → Fr-01
- Fr-03.1 → Fr-01
- Fr-03.2 → Fr-01
- Fr-04.1 → Fr-01
- Fr-04.2 → Fr-01
- Fr-05 → Fr-01
- Fr-05 → Fr-04.1
- Fr-05 → Fr-04.2
