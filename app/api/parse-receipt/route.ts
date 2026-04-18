import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

const client = new Anthropic()

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "API key de IA no configurada" }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { imageBase64, mediaType: rawMediaType, existingItems } = body as {
      imageBase64: string
      mediaType: string
      existingItems: { id: string; name: string; variant_info?: string; sku?: string }[]
    }
    const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'] as const
    type SupportedType = typeof supported[number]
    const mediaType: SupportedType = (supported as readonly string[]).includes(rawMediaType)
      ? rawMediaType as SupportedType
      : 'image/jpeg'

    const existingList = existingItems.length > 0
      ? `Artículos existentes en el inventario (intenta hacer match con estos cuando sea posible):\n${existingItems.map(i => `- ID: ${i.id} | Nombre: ${i.name}${i.variant_info ? ` — ${i.variant_info}` : ''}${i.sku ? ` (SKU: ${i.sku})` : ''}`).join('\n')}`
      : "No hay artículos en el inventario aún."

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType,
                data: imageBase64,
              },
            },
            {
              type: "text",
              text: `Analiza este ticket o factura de compra y extrae los artículos comprados.

${existingList}

Para cada artículo en el ticket:
1. Extrae nombre, cantidad, precio unitario y proveedor (nombre del negocio en el ticket)
2. Si coincide con un artículo existente, usa su ID en "matched_id"
3. Si no coincide, propón un nombre genérico (ej: "Tornillo") y una especificación (ej: "M6 × 20mm, Zinc")
4. Usa español para todos los nombres

Para "ticket_total": busca el monto FINAL del ticket — el que se pagó en caja.
- Debe ser el valor más alto etiquetado como "TOTAL", "TOTAL A PAGAR", "IMPORTE TOTAL" o similar
- NO uses "Subtotal", "IVA", "Descuento" ni ningún monto parcial
- Si el ticket tiene IVA separado, el total YA lo incluye — usa ese número, no el subtotal
- Si no encuentras un total claro, usa null

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "supplier": "nombre del proveedor/tienda",
  "ticket_total": 0.00,
  "items": [
    {
      "matched_id": "uuid-si-coincide-o-null",
      "name": "Nombre genérico del artículo",
      "variant_info": "especificación si aplica o null",
      "quantity": 1,
      "unit_cost": 0.00
    }
  ]
}`,
            },
          ],
        },
      ],
    })

    const text = response.content[0].type === "text" ? response.content[0].text : ""

    // Extract JSON: first try code blocks, then fall back to bare object
    const codeBlockMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
    const jsonStr = codeBlockMatch ? codeBlockMatch[1].trim() : text.trim()
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: "No se pudo leer el ticket" }, { status: 422 })
    }

    const parsed = JSON.parse(jsonMatch[0])
    return NextResponse.json(parsed)
  } catch (err) {
    console.error("parse-receipt error:", err)
    return NextResponse.json({ error: "Error al procesar la imagen" }, { status: 500 })
  }
}
