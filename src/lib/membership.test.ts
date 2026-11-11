import { describe, expect, it } from "vitest";
import {
  accessUntil,
  currentMembership,
  daysLeft,
  inclusiveDays,
  membershipEndDate,
  membershipPhase,
  nextMembershipPeriod,
  overlapping,
  type MembershipPeriod,
} from "./membership";

const PLAN_1M = { durationMonths: 1, bonusMonths: 0 };
const PLAN_6M = { durationMonths: 6, bonusMonths: 1 };
const PLAN_12M = { durationMonths: 12, bonusMonths: 2 };

const m = (id: string, startDate: string, endDate: string, status: MembershipPeriod["status"] = "active") => ({
  id,
  startDate,
  endDate,
  status,
});

describe("membershipEndDate", () => {
  it("matches the handoff example", () => {
    expect(membershipEndDate("2026-11-11", 1)).toBe("2026-12-10");
  });

  it("starting on the 1st ends on the last day of the final month", () => {
    expect(membershipEndDate("2026-11-01", 1)).toBe("2026-11-30");
    expect(membershipEndDate("2026-01-01", 12)).toBe("2026-12-31");
  });

  it("crosses year boundaries", () => {
    expect(membershipEndDate("2026-12-15", 1)).toBe("2027-01-14");
    expect(membershipEndDate("2026-11-11", 14)).toBe("2028-01-10");
  });

  it("ends on the month's last day when the same day does not exist", () => {
    expect(membershipEndDate("2026-01-31", 1)).toBe("2026-02-28");
    expect(membershipEndDate("2026-01-30", 1)).toBe("2026-02-28");
    expect(membershipEndDate("2026-03-31", 1)).toBe("2026-04-30");
    expect(membershipEndDate("2026-08-31", 7)).toBe("2027-03-30");
  });

  it("handles leap years", () => {
    expect(membershipEndDate("2028-01-29", 1)).toBe("2028-02-28"); // Feb 29 exists in 2028
    expect(membershipEndDate("2027-01-29", 1)).toBe("2027-02-28"); // …but not in 2027
    expect(membershipEndDate("2028-02-29", 12)).toBe("2029-02-28");
    expect(membershipEndDate("2028-01-31", 1)).toBe("2028-02-29");
  });

  it("rejects invalid month counts", () => {
    expect(() => membershipEndDate("2026-11-11", 0)).toThrow(RangeError);
    expect(() => membershipEndDate("2026-11-11", 1.5)).toThrow(RangeError);
  });
});

describe("phases and days left", () => {
  const membership = m("a", "2026-11-11", "2026-12-10");

  it("derives the phase from today", () => {
    expect(membershipPhase(membership, "2026-11-10")).toBe("scheduled");
    expect(membershipPhase(membership, "2026-11-11")).toBe("active");
    expect(membershipPhase(membership, "2026-12-10")).toBe("active");
    expect(membershipPhase(membership, "2026-12-11")).toBe("expired");
    expect(membershipPhase({ ...membership, status: "canceled" }, "2026-11-20")).toBe("canceled");
  });

  it("counts today and the last day", () => {
    expect(daysLeft(membership, "2026-11-11")).toBe(30);
    expect(daysLeft(membership, "2026-12-10")).toBe(1);
    expect(daysLeft(membership, "2026-12-11")).toBe(0);
    expect(inclusiveDays("2026-11-11", "2026-12-10")).toBe(30);
  });
});

describe("nextMembershipPeriod", () => {
  it("new member starts today by default", () => {
    expect(nextMembershipPeriod({ existing: [], plan: PLAN_1M, todayKey: "2026-11-11" })).toEqual({
      startDate: "2026-11-11",
      endDate: "2026-12-10",
      extendsExisting: false,
    });
  });

  it("new member can start on a later chosen date (deposit date ≠ start date)", () => {
    const next = nextMembershipPeriod({ existing: [], plan: PLAN_6M, todayKey: "2026-11-11", requestedStart: "2026-12-01" });
    expect(next).toEqual({ startDate: "2026-12-01", endDate: "2027-06-30", extendsExisting: false });
  });

  it("extension keeps every remaining day", () => {
    const existing = [m("a", "2026-11-11", "2026-12-10")];
    const next = nextMembershipPeriod({ existing, plan: PLAN_12M, todayKey: "2026-11-30" });
    expect(next).toEqual({ startDate: "2026-12-11", endDate: "2028-02-10", extendsExisting: true });
  });

  it("chains after a scheduled future membership too", () => {
    const existing = [m("a", "2026-11-11", "2026-12-10"), m("b", "2026-12-11", "2027-01-10")];
    const next = nextMembershipPeriod({ existing, plan: PLAN_1M, todayKey: "2026-11-20" });
    expect(next.startDate).toBe("2027-01-11");
  });

  it("expired member starts fresh (not from the old end date)", () => {
    const existing = [m("a", "2026-08-01", "2026-08-31")];
    const next = nextMembershipPeriod({ existing, plan: PLAN_1M, todayKey: "2026-11-11" });
    expect(next).toEqual({ startDate: "2026-11-11", endDate: "2026-12-10", extendsExisting: false });
  });

  it("ignores canceled and refunded memberships", () => {
    const existing = [m("a", "2026-11-01", "2026-11-30", "canceled"), m("b", "2026-11-01", "2027-05-31", "refunded")];
    expect(nextMembershipPeriod({ existing, plan: PLAN_1M, todayKey: "2026-11-11" }).startDate).toBe("2026-11-11");
  });

  it("crew override wins", () => {
    const existing = [m("a", "2026-11-11", "2026-12-10")];
    const next = nextMembershipPeriod({ existing, plan: PLAN_1M, todayKey: "2026-11-20", startOverride: "2027-01-01" });
    expect(next).toEqual({ startDate: "2027-01-01", endDate: "2027-01-31", extendsExisting: false });
  });
});

describe("current membership", () => {
  const rows = [
    m("old", "2026-01-01", "2026-01-31"),
    m("now", "2026-11-11", "2026-12-10"),
    m("next", "2026-12-11", "2027-01-10"),
    m("void", "2026-11-01", "2027-11-01", "canceled"),
  ];

  it("prefers the one in effect, then the next one, then the latest past one", () => {
    expect(currentMembership(rows, "2026-11-20")?.id).toBe("now");
    expect(currentMembership(rows, "2026-12-20")?.id).toBe("next");
    expect(currentMembership(rows, "2026-05-01")?.id).toBe("now");
    expect(currentMembership(rows, "2027-02-01")?.id).toBe("next");
    expect(currentMembership([], "2026-11-20")).toBeNull();
  });

  it("access runs to the end of the chain", () => {
    expect(accessUntil(rows, "2026-11-20")).toBe("2027-01-10");
    expect(accessUntil(rows, "2027-02-01")).toBeNull();
  });

  it("finds overlaps", () => {
    expect(overlapping(rows, "2026-12-01", "2026-12-31").map((r) => r.id)).toEqual(["now", "next"]);
    expect(overlapping(rows, "2026-12-01", "2026-12-31", "now").map((r) => r.id)).toEqual(["next"]);
  });
});
