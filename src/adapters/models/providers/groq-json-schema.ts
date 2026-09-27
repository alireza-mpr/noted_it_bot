import type { ResponseSchema } from "../model-result";

// Represents a schema in standard JSON Schema.
export type JsonSchema = Record<string, unknown>;

// Returns the schema in the JSON Schema that Groq's strict mode needs:
// lowercase types, null as a type, every property required, and no extra
// properties. The bot writes its schemas in Gemini's format.
export function toGroqJsonSchema(responseSchema: ResponseSchema): JsonSchema {
  // required and propertyOrdering are left out: strict mode requires every
  // property, and Groq does not know propertyOrdering.
  const { type, nullable, properties, items, required, propertyOrdering, ...otherKeywords } =
    responseSchema;
  const lowercaseType = type.toLowerCase();
  const jsonSchema: JsonSchema = {
    ...otherKeywords,
    type: nullable ? [lowercaseType, "null"] : lowercaseType,
  };
  if (properties) {
    jsonSchema.properties = Object.fromEntries(
      Object.entries(properties).map(([propertyName, propertySchema]) => [
        propertyName,
        toGroqJsonSchema(propertySchema),
      ]),
    );
    jsonSchema.required = Object.keys(properties);
    jsonSchema.additionalProperties = false;
  }
  if (items) {
    jsonSchema.items = toGroqJsonSchema(items);
  }
  return jsonSchema;
}
