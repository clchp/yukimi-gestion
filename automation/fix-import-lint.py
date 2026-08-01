from pathlib import Path

path = Path("apps/web/src/pages/inventory-page.tsx")
text = path.read_text(encoding="utf-8")
old = "import type { ImportDetail, InventoryMovementAction, InventoryRow } from '@yukimi/shared';"
new = "import type { InventoryMovementAction, InventoryRow } from '@yukimi/shared';"
if old not in text:
    raise RuntimeError("No se encontró la importación sin uso que debía corregirse.")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("Importación sin uso eliminada.")
