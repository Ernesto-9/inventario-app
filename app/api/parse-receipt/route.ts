import Anthropic from "@anthropic-ai/sdk"
import { NextRequest, NextResponse } from "next/server"

const client = new Anthropic()

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "API key de IA no configurada" }, { status: 503 })
  }

  try {
    const body = await request.json()
    const { imageBase64, mediaType, existingItems } = body as {
      imageBase64: string
      mediaType: string
      existingItems: { id: string; name: string; variant_info?: string; sku?: string }[]
    }

    const existingList = existingItems.length > 0
      ? `Artículos existentes en el inventario (intenta hacer match con estos cuando sea posible):\n${existingItems.map(i => `- ID: ${i.id} | Nombre: ${i.name}${i.variant_info ? ` — ${i.variant_info}` : ''}${i.sku ? ` (SKU: ${i.sku})` : ''}`).join('\n')}`
      : "No hay artículos en el inventario aún."

    const response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: mediaType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
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

Responde ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "supplier": "nombre del proveedor/tienda",
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

    // Extract JSON from response (remove markdown code blocks if present)
    const jsonMatch = text.match(/\{[\s\S]*\}/)
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
