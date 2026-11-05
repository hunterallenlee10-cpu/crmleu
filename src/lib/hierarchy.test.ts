import { describe, expect, it } from "vitest";
import { buildOrgTree, parseTitle, type OrgNode, type OrgPerson } from "./hierarchy";

const person = (id: string, reportsTo: string | null = null, role: "admin" | "rep" = "rep"): OrgPerson => ({
  id,
  name: id.toUpperCase(),
  role,
  title: null,
  reportsTo,
});
const shape = (nodes: OrgNode[]): unknown => nodes.map((n) => (n.reports.length ? [n.person.id, shape(n.reports)] : n.person.id));

describe("buildOrgTree", () => {
  it("nests people under who they report to", () => {
    const tree = buildOrgTree([person("c", "b"), person("b", "a"), person("a", null, "admin"), person("d", "a")]);
    expect(shape(tree)).toEqual([["a", [["b", ["c"]], "d"]]]);
    expect(tree[0].size).toBe(4);
  });

  it("puts admins first at the top, then everyone by name", () => {
    const tree = buildOrgTree([person("z"), person("m", null, "admin"), person("b")]);
    expect(shape(tree)).toEqual(["m", "b", "z"]);
  });

  it("moves people whose manager isn't on the chart to the top", () => {
    const tree = buildOrgTree([person("a"), person("b", "gone")]);
    expect(shape(tree)).toEqual(["a", "b"]);
  });

  it("still shows everyone if a loop slipped in", () => {
    const tree = buildOrgTree([person("a", "b"), person("b", "a"), person("c", "c")]);
    const ids = JSON.stringify(shape(tree));
    for (const id of ["a", "b", "c"]) expect(ids).toContain(`"${id}"`);
    expect(tree.reduce((n, t) => n + t.size, 0)).toBe(3);
  });
});

describe("parseTitle", () => {
  it("trims, collapses spaces and treats blank as none", () => {
    expect(parseTitle("  Head   of Sales ")).toEqual({ ok: true, title: "Head of Sales" });
    expect(parseTitle("   ")).toEqual({ ok: true, title: null });
  });
  it("rejects long titles", () => {
    expect(parseTitle("x".repeat(61)).ok).toBe(false);
  });
});
