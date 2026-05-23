export * from "./customer";
export * from "./lead";
export * from "./ticket";
export * from "./activity";
export * from "./action";
export * from "./error";
export * from "./research";

export const RESOURCES = ["customer", "lead", "ticket", "activity", "action", "research"] as const;
export type Resource = (typeof RESOURCES)[number];
