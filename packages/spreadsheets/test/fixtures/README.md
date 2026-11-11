# Producer fixtures

Unmodified small files from [tidyverse/readxl](https://github.com/tidyverse/readxl/tree/dec72cdb2b8f0dfb7a2c12e01039fdecaa5561da/tests/testthat/sheets),
revision `dec72cdb2b8f0dfb7a2c12e01039fdecaa5561da` (MIT, included in
`LICENSE.readxl`). Original file names identify the producers:

| Local file | Upstream file | Producer |
| --- | --- | --- |
| iris-excel.xlsx | iris-excel-xlsx.xlsx | Microsoft Excel |
| iris-google-sheets.xlsx | iris-google-doc.xlsx | Google Sheets |
| dates-libreoffice.xlsx | dates-1900-LibreOffice.xlsx | LibreOffice Calc |

The Iris files contain the public Iris dataset. These provide independent
producer compatibility coverage; crafted test-code fixtures provide the detailed
feature and hostile-input coverage. No fixture executes macros or formulas.
