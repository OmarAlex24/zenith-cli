import { ZenithError } from "./json-output";

export async function readJsonInput(input?: string): Promise<unknown> {
  if (!input) {
    throw new ZenithError("Missing --input -. Provide structured JSON on stdin.", {
      code: "input_required",
    });
  }

  const raw = input === "-" ? await Bun.stdin.text() : await Bun.file(input).text();

  try {
    return JSON.parse(raw) as unknown;
  } catch (error) {
    throw new ZenithError("Invalid JSON input.", {
      code: "invalid_json_input",
      details: error instanceof Error ? error.message : String(error),
    });
  }
}
