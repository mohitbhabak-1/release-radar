import { existsSync, readFileSync } from "node:fs";
import { buildSchema, coerceInputValue, parse, validate, type GraphQLInputType } from "graphql";
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config";
import { ISSUES_QUERY, issueFilter, PROJECTS_QUERY, projectFilter } from "./linear";

// Validates our queries against Linear's published schema. Set LINEAR_SCHEMA_PATH to a copy of
// https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql to run it.
const path = process.env.LINEAR_SCHEMA_PATH;
describe.skipIf(!path || !existsSync(path))("Linear queries match Linear's schema", () => {
  const schema = () => buildSchema(readFileSync(path!, "utf8"));
  it("projects query is valid", () => expect(validate(schema(), parse(PROJECTS_QUERY))).toEqual([]));
  it("issues query is valid", () => expect(validate(schema(), parse(ISSUES_QUERY))).toEqual([]));
  it("filters coerce against the schema's input types", () => {
    const cfg = loadConfig();
    cfg.linear.teams = ["WAL"];
    cfg.linear.feature_labels = ["feature"];
    cfg.linear.include_states = ["Done"];
    const s = schema();
    // graphql v17 returns undefined (or throws) when the value doesn't fit the input type.
    const check = (typeName: string, value: unknown): string[] => {
      try {
        return coerceInputValue(value, s.getType(typeName) as GraphQLInputType) === undefined ? ["rejected"] : [];
      } catch (e) {
        return [e instanceof Error ? e.message : "rejected"];
      }
    };
    expect(check("ProjectFilter", projectFilter(cfg, "2026-01-01T00:00:00.000Z"))).toEqual([]);
    expect(check("IssueFilter", issueFilter(cfg, "2026-01-01T00:00:00.000Z"))).toEqual([]);
    expect(check("IssueFilter", { teem: {} })).not.toEqual([]); // sanity: the check really rejects bad input
  });
});
