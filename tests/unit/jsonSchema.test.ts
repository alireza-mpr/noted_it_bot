import { describe, expect, it } from "vitest";
import { EVENT_SCHEMA } from "../../src/extractedEvents/event_schema";
import { toJsonSchema } from "../../src/providers/groq/jsonSchema";

describe("toJsonSchema", () => {
  const schema = toJsonSchema(EVENT_SCHEMA as never) as {
    type: string;
    required: string[];
    additionalProperties: boolean;
    propertyOrdering?: unknown;
    properties: Record<string, any>;
  };

  it("lowercases types and turns nullable into a null type", () => {
    expect(schema.type).toBe("object");
    expect(schema.properties.calendar.type).toEqual(["string", "null"]);
    expect(schema.properties.year.type).toEqual(["integer", "null"]);
    expect(schema.properties.recurrence.type).toEqual(["object", "null"]);
    expect(schema.properties.recurrence.properties.weekdays.type).toEqual([
      "array",
      "null",
    ]);
    expect(schema.properties.recurrence.properties.weekdays.items.type).toBe(
      "string",
    );
  });

  it("keeps enums", () => {
    expect(schema.properties.date_kind.enum).toEqual([
      "absolute",
      "relative",
      "weekday",
      "none",
    ]);
  });

  it("requires every property and forbids extras, at every object level", () => {
    expect(schema.required).toEqual(Object.keys(schema.properties));
    expect(schema.additionalProperties).toBe(false);
    const recurrence = schema.properties.recurrence;
    expect(recurrence.required).toEqual(Object.keys(recurrence.properties));
    expect(recurrence.additionalProperties).toBe(false);
  });

  it("drops the Gemini-only propertyOrdering", () => {
    expect(schema.propertyOrdering).toBeUndefined();
    expect(schema.properties.recurrence.propertyOrdering).toBeUndefined();
  });
});
