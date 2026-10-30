import { describe, expect, it } from "vitest";
import {
  getFullName,
  getShortNames,
  isSameName,
  splitName,
} from "./person-names";

const ada = { firstName: "Ada", lastName: "Lovelace" };
const adaKing = { firstName: "Ada", lastName: "King" };
const adaLane = { firstName: "Ada", lastName: "Lane" };
const bo = { firstName: "Bo", lastName: "Diddley" };

describe("person names", () => {
  it("shows first names while nobody else has theirs", () => {
    const shortName = getShortNames([ada, bo]);
    expect(shortName(ada)).toBe("Ada");
    expect(shortName(bo)).toBe("Bo");
  });

  it("adds the last name's initial once a first name's shared", () => {
    const shortName = getShortNames([ada, adaKing, bo]);
    expect(shortName(ada)).toBe("Ada L.");
    expect(shortName(adaKing)).toBe("Ada K.");
    expect(shortName(bo)).toBe("Bo");
  });

  it("shows the full name once the initial's shared too", () => {
    const shortName = getShortNames([ada, adaKing, adaLane]);
    expect(shortName(ada)).toBe("Ada Lovelace");
    expect(shortName(adaLane)).toBe("Ada Lane");
    expect(shortName(adaKing)).toBe("Ada K.");
  });

  it("counts the same name, in any case, as one person", () => {
    const shortName = getShortNames([
      ada,
      { firstName: "ada", lastName: "lovelace" },
    ]);
    expect(shortName(ada)).toBe("Ada");
  });

  it("shows whichever part's set when the other isn't", () => {
    const shortName = getShortNames([
      ada,
      { firstName: "Ada", lastName: "" },
      { firstName: "", lastName: "Hopper" },
    ]);
    expect(shortName({ firstName: "Ada", lastName: "" })).toBe("Ada");
    expect(shortName(ada)).toBe("Ada L.");
    expect(shortName({ firstName: "", lastName: "Hopper" })).toBe("Hopper");
    expect(shortName({ firstName: "", lastName: "" })).toBe("");
  });

  it("joins and splits whole names", () => {
    expect(getFullName(ada)).toBe("Ada Lovelace");
    expect(getFullName({ firstName: "", lastName: "Hopper" })).toBe("Hopper");
    expect(splitName("  Mary Ann  Smith ")).toEqual({
      firstName: "Mary",
      lastName: "Ann Smith",
    });
    expect(splitName("Ada")).toEqual({ firstName: "Ada", lastName: "" });
    expect(splitName("")).toEqual({ firstName: "", lastName: "" });
    expect(isSameName(ada, { firstName: "ADA", lastName: "LOVELACE" })).toBe(
      true
    );
    expect(isSameName(ada, adaKing)).toBe(false);
  });
});
