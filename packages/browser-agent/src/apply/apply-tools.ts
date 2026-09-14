import type { ApplyProposal } from "./types";

/**
 * What the apply agent is allowed to ask for.
 *
 * Each of these is a request, not an action. The executor decides whether it
 * happens, and for anything with an answer in it, what the answer actually is.
 * `submit_application` exists so the agent can say the form is finished; it is
 * refused unless the saved authority document covers this application.
 */

export const APPLY_TOOL_NAMES = [
  "inspect_form",
  "read_blockers",
  "answer_control",
  "attach_document",
  "go_to_step",
  "submit_application",
  "finish",
] as const;

export type ApplyToolName = (typeof APPLY_TOOL_NAMES)[number];

/** Same shape the discovery tools hand the model, so one client serves both. */
export interface ApplyToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export function getApplyToolDefinitions(): ApplyToolDefinition[] {
  return [
    {
      type: "function",
      function: {
        name: "inspect_form",
        description:
          "Read the application form as it is right now: every field, what it asks, whether it is required, whether it already has an answer, which buttons are there, and which step of the form you are on. Start here, and use it again whenever the page changes.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "read_blockers",
        description:
          "Check whether the page is showing something only the person can handle: a sign-in wall, an account gate, a security check, a code sent to their phone, or a closed posting.",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function",
      function: {
        name: "answer_control",
        description:
          "Answer one field. Job Finder fills in the answer itself from the profile, the resume for this job, and saved answers — you choose which field to do next. Only when a field is free text with nothing stored for it are you asked to write the answer; pass it as freeTextAnswer and say what you based it on.",
        parameters: {
          type: "object",
          properties: {
            ref: {
              type: "string",
              description: "The field handle from inspect_form, such as c4.",
            },
            freeTextAnswer: {
              type: "string",
              description:
                "Only for a free-text field with no stored answer. Write it from the resume, the profile, and the posting. Never invent a fact.",
            },
            groundedIn: {
              type: "array",
              items: { type: "string" },
              description:
                "What you based a written answer on, in plain words: 'the resume sent with this application', 'the posting'.",
            },
          },
          required: ["ref"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "attach_document",
        description:
          "Attach one of the files Job Finder already holds for this application to a file field. If the form wants a file that is not on the list, do not attach anything: the person is asked for it instead.",
        parameters: {
          type: "object",
          properties: {
            ref: { type: "string", description: "The file field handle, such as c9." },
            documentId: {
              type: "string",
              description: "The id of the file from the document list in your instructions.",
            },
          },
          required: ["ref", "documentId"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "go_to_step",
        description:
          "Press a button that moves between steps of the form, such as Next, Continue, or Back. This never sends the application.",
        parameters: {
          type: "object",
          properties: {
            ref: { type: "string", description: "The button handle, such as a2." },
          },
          required: ["ref"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "submit_application",
        description:
          "Say the form is complete and the send button should be pressed. Job Finder checks everything again and presses it only if the person allowed that for this application; otherwise the application stops here, filled in and ready.",
        parameters: {
          type: "object",
          properties: {
            ref: { type: "string", description: "The send button handle, such as a5." },
          },
          required: ["ref"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "finish",
        description:
          "Finish this application. Call it when the form is complete, when the page cannot go further, or when you are genuinely stuck. There is no fixed number of steps: a short form takes a few, a long one takes many more. When you are stuck, pass stuck: true and say exactly what is blocking you.",
        parameters: {
          type: "object",
          properties: {
            reason: {
              type: "string",
              description: "Why you are finishing, in one plain sentence.",
            },
            stuck: {
              type: "boolean",
              description:
                "true when you are stopping because you could not get any further, rather than because the work is done.",
            },
          },
          required: ["reason"],
        },
      },
    },
  ];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function asStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const values = value.filter((entry): entry is string => typeof entry === "string");
  return values.length > 0 ? values : null;
}

export type ApplyProposalParse =
  | { ok: true; proposal: ApplyProposal }
  | { ok: false; error: string };

/** Turns one model tool call into a proposal, or says plainly what was wrong with it. */
export function parseApplyProposal(
  toolName: string,
  rawArguments: string,
): ApplyProposalParse {
  let parsedArguments: unknown = {};
  if (rawArguments.trim().length > 0) {
    try {
      parsedArguments = JSON.parse(rawArguments);
    } catch {
      return { ok: false, error: `The arguments for ${toolName} were not valid JSON.` };
    }
  }
  const args = asRecord(parsedArguments);

  switch (toolName) {
    case "inspect_form":
      return { ok: true, proposal: { tool: "inspect_form" } };
    case "read_blockers":
      return { ok: true, proposal: { tool: "read_blockers" } };
    case "answer_control": {
      const ref = asString(args.ref);
      if (!ref) {
        return { ok: false, error: "answer_control needs the field handle in ref." };
      }
      const freeTextAnswer = asString(args.freeTextAnswer);
      const groundedIn = asStringArray(args.groundedIn);
      return {
        ok: true,
        proposal: {
          tool: "answer_control",
          ref,
          ...(freeTextAnswer ? { freeTextAnswer } : {}),
          ...(groundedIn ? { groundedIn } : {}),
        },
      };
    }
    case "attach_document": {
      const ref = asString(args.ref);
      const documentId = asString(args.documentId);
      if (!ref || !documentId) {
        return {
          ok: false,
          error: "attach_document needs both the field handle in ref and documentId.",
        };
      }
      return { ok: true, proposal: { tool: "attach_document", ref, documentId } };
    }
    case "go_to_step": {
      const ref = asString(args.ref);
      if (!ref) {
        return { ok: false, error: "go_to_step needs the button handle in ref." };
      }
      return { ok: true, proposal: { tool: "go_to_step", ref } };
    }
    case "submit_application": {
      const ref = asString(args.ref);
      if (!ref) {
        return { ok: false, error: "submit_application needs the send button handle in ref." };
      }
      return { ok: true, proposal: { tool: "submit_application", ref } };
    }
    case "finish": {
      const reason = asString(args.reason) ?? "Finished without saying why.";
      return {
        ok: true,
        proposal: { tool: "finish", reason, stuck: args.stuck === true },
      };
    }
    default:
      return { ok: false, error: `There is no tool called ${toolName}.` };
  }
}
