import { bootstrapLocalEnvironment } from "./bootstrap.js";

bootstrapLocalEnvironment();

await import("./server.js");
