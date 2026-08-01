from pathlib import Path

path = Path("automation/apply-import-revalidation.py")
text = path.read_text(encoding="utf-8")

broken_reason = '''text = text.replace(
    "errors: { ...receiveDialog.errors, reason: '' },",
    "errors: Object.fromEntries(Object.entries(receiveDialog.errors).filter(([key]) => key !== 'reason')),
",
)
'''
fixed_reason = '''text = text.replace(
    "errors: { ...receiveDialog.errors, reason: '' },",
    "errors: Object.fromEntries(Object.entries(receiveDialog.errors).filter(([key]) => key !== 'reason')),\\n",
)
'''
if broken_reason not in text:
    raise RuntimeError("No se encontró el literal roto de limpieza de errores.")
text = text.replace(broken_reason, fixed_reason, 1)

broken_date = 'text = text.replace("        occurredAt: new Date().toISOString(),", "        occurredAt: new Date(receiveDialog.receivedAt).toISOString(),", 1)\n'
fixed_date = '''text = replace_once(
    text,
    """      input: {
        reason: receiveDialog.reason.trim(),
        occurredAt: new Date().toISOString(),
""",
    """      input: {
        reason: receiveDialog.reason.trim(),
        occurredAt: new Date(receiveDialog.receivedAt).toISOString(),
""",
    "fecha real enviada en recepción",
)
'''
if broken_date not in text:
    raise RuntimeError("No se encontró el reemplazo inseguro de fecha de recepción.")
text = text.replace(broken_date, fixed_date, 1)

path.write_text(text, encoding="utf-8")
print("Script de importaciones reparado.")
