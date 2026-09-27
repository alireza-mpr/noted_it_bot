import { describe, expect, it } from "vitest";
import type { ResponseSchema } from "../../../../../src/adapters/models/model-result";
import { toGroqJsonSchema } from "../../../../../src/adapters/models/providers/groq-json-schema";

const GEMINI_SCHEMA: ResponseSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING", nullable: true },
    date_kind: { type: "STRING", enum: ["absolute", "none"] },
    repeat: {
      type: "OBJECT",
      nullable: true,
      properties: {
        weekdays: { type: "ARRAY", nullable: true, items: { type: "STRING" } },
        interval: { type: "INTEGER" },
      },
      required: ["interval"],
      propertyOrdering: ["weekdays", "interval"],
    },
  },
  required: ["date_kind"],
  propertyOrdering: ["title", "date_kind", "repeat"],
};

// Represents the parts of the converted schema that the tests read.
interface ConvertedSchema {
  type: unknown;
  enum?: unknown;
  items?: ConvertedSchema;
  properties: Record<string, ConvertedSchema>;
  required: string[];
  additionalProperties: boolean;
  propertyOrdering?: unknown;
}

const jsonSchema = toGroqJsonSchema(GEMINI_SCHEMA) as unknown as ConvertedSchema;
const repeatSchema = jsonSchema.properties.repeat;

describe("toGroqJsonSchema", () => {
  it("lowercases types and turns nullable into a null type", () => {
    expect(jsonSchema.type).toBe("object");
    expect(jsonSchema.properties.title.type).toEqual(["string", "null"]);
    expect(repeatSchema.type).toEqual(["object", "null"]);
    expect(repeatSchema.properties.weekdays.type).toEqual(["array", "null"]);
    expect(repeatSchema.properties.weekdays.items?.type).toBe("string");
  });

  it("keeps enums", () => {
    expect(jsonSchema.properties.date_kind.enum).toEqual(["absolute", "none"]);
  });

  it("requires every property and forbids extras, at every object level", () => {
    expect(jsonSchema.required).toEqual(["title", "date_kind", "repeat"]);
    expect(jsonSchema.additionalProperties).toBe(false);
    expect(repeatSchema.required).toEqual(["weekdays", "interval"]);
    expect(repeatSchema.additionalProperties).toBe(false);
  });

  it("drops Gemini's propertyOrdering", () => {
    expect(jsonSchema.propertyOrdering).toBeUndefined();
    expect(repeatSchema.propertyOrdering).toBeUndefined();
  });
});
