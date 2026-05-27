export interface QuotationMessageItem {
  name: string
  quantity: number
  unit: string | null
}

export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 0) return null
  if (digits.startsWith("52")) return digits
  if (digits.length === 10) return `52${digits}`
  return digits
}

export function buildQuotationMessage(items: QuotationMessageItem[]): string {
  const lines = items.map(i => {
    const qty = Number.isInteger(i.quantity) ? i.quantity.toString() : i.quantity.toString()
    const unit = i.unit ? ` ${i.unit}` : ""
    return `• ${qty}${unit} — ${i.name}`
  })
  return `Hola, ¿me cotizas por favor los siguientes artículos?\n${lines.join("\n")}\nGracias.`
}

export function buildWhatsAppUrl(phone: string | null | undefined, message: string): string | null {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`
}

export function buildTelUrl(phone: string | null | undefined): string | null {
  const normalized = normalizePhone(phone)
  if (!normalized) return null
  return `tel:+${normalized}`
}

export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return ""
  const digits = phone.replace(/\D/g, "")
  if (digits.length === 10) {
    return `${digits.slice(0, 2)} ${digits.slice(2, 6)} ${digits.slice(6)}`
  }
  if (digits.length === 12 && digits.startsWith("52")) {
    const rest = digits.slice(2)
    return `+52 ${rest.slice(0, 2)} ${rest.slice(2, 6)} ${rest.slice(6)}`
  }
  return phone
}
