// The extraction schema is written for Gemini: uppercase types, `nullable`,
// optional fields. Groq needs standard JSON Schema in strict mode: lowercase
// types, null as a type, every property required, and no extra properties.
interface SchemaNode {
  type: string;
  nullable?: boolean;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  required?: string[];
  propertyOrdering?: string[];
  [key: string]: unknown;
}

export function toJsonSchema(schema: SchemaNode): Record<string, unknown> {
  const { type, nullable, properties, items, required, propertyOrdering, ...rest } =
    schema;
  const lowerType = type.toLowerCase();
  const out: Record<string, unknown> = {
    ...rest,
    type: nullable ? [lowerType, "null"] : lowerType,
  };
  if (properties) {
    out.properties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => [key, toJsonSchema(value)]),
    );
    out.required = Object.keys(properties);
    out.additionalProperties = false;
  }
  if (items) {
    out.items = toJsonSchema(items);
  }
  return out;
}
