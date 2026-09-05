import { z } from "zod";

import { IsoDateTimeSchema } from "./base";

export const interviewChatLimits = {
  maxAttachmentsPerMessage: 4,
  maxConversationMessages: 200,
  maxImageBytes: 12 * 1024 * 1024,
  maxMessageCharacters: 16_000,
} as const;

const InterviewChatIdSchema = z.string().trim().min(1).max(160);
const InterviewChatFileNameSchema = z.string().trim().min(1).max(255);
const InterviewChatMessageContentSchema = z
  .string()
  .trim()
  .max(interviewChatLimits.maxMessageCharacters);
const InterviewChatNonEmptyMessageContentSchema =
  InterviewChatMessageContentSchema.min(1);
const InterviewChatAltTextSchema = z.string().trim().min(1).max(2_000);
const InterviewChatImageBase64Schema = z
  .string()
  .trim()
  .min(4)
  .max(Math.ceil(interviewChatLimits.maxImageBytes / 3) * 4)
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/,
    "Image data must be unprefixed base64.",
  );

export const InterviewChatImageMimeTypeSchema = z.enum([
  "image/png",
  "image/jpeg",
  "image/webp",
]);
export type InterviewChatImageMimeType = z.infer<
  typeof InterviewChatImageMimeTypeSchema
>;

export const InterviewChatImageSourceSchema = z.enum([
  "screenshot_capture",
  "file_picker",
  "clipboard",
]);
export type InterviewChatImageSource = z.infer<
  typeof InterviewChatImageSourceSchema
>;

export const InterviewChatAttachmentRetentionSchema = z.enum([
  "temporary",
  "session_pinned",
]);
export type InterviewChatAttachmentRetention = z.infer<
  typeof InterviewChatAttachmentRetentionSchema
>;

const InterviewChatImageDimensionsSchema = z
  .object({
    width: z.number().int().positive().max(32_768),
    height: z.number().int().positive().max(32_768),
  })
  .strict();

export const InterviewChatImageAttachmentInputSchema = z
  .object({
    source: InterviewChatImageSourceSchema,
    fileName: InterviewChatFileNameSchema,
    mimeType: InterviewChatImageMimeTypeSchema,
    dataBase64: InterviewChatImageBase64Schema,
    byteSize: z
      .number()
      .int()
      .positive()
      .max(interviewChatLimits.maxImageBytes),
    dimensions: InterviewChatImageDimensionsSchema.nullable().default(null),
  })
  .strict()
  .superRefine((value, ctx) => {
    const paddingLength = value.dataBase64.endsWith("==")
      ? 2
      : value.dataBase64.endsWith("=")
        ? 1
        : 0;
    const decodedByteSize =
      Math.floor((value.dataBase64.length * 3) / 4) - paddingLength;

    if (decodedByteSize !== value.byteSize) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Declared image byte size does not match its base64 payload.",
        path: ["byteSize"],
      });
    }
  });
export type InterviewChatImageAttachmentInput = z.input<
  typeof InterviewChatImageAttachmentInputSchema
>;

export const InterviewChatImageAttachmentSchema = z
  .object({
    id: InterviewChatIdSchema,
    kind: z.literal("image"),
    source: InterviewChatImageSourceSchema,
    fileName: InterviewChatFileNameSchema,
    mimeType: InterviewChatImageMimeTypeSchema,
    byteSize: z
      .number()
      .int()
      .positive()
      .max(interviewChatLimits.maxImageBytes),
    dimensions: InterviewChatImageDimensionsSchema.nullable().default(null),
    retention: InterviewChatAttachmentRetentionSchema.default("temporary"),
    altText: InterviewChatAltTextSchema.nullable().default(null),
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type InterviewChatImageAttachment = z.infer<
  typeof InterviewChatImageAttachmentSchema
>;

const InterviewChatMessageIdentitySchema = {
  id: InterviewChatIdSchema,
  conversationId: InterviewChatIdSchema,
  sessionId: InterviewChatIdSchema.nullable().default(null),
  createdAt: IsoDateTimeSchema,
} as const;

const InterviewChatUserMessageObjectSchema = z
  .object({
    ...InterviewChatMessageIdentitySchema,
    role: z.literal("user"),
    content: InterviewChatMessageContentSchema.default(""),
    attachments: z
      .array(InterviewChatImageAttachmentSchema)
      .max(interviewChatLimits.maxAttachmentsPerMessage)
      .default([]),
  })
  .strict();

export const InterviewChatUserMessageSchema =
  InterviewChatUserMessageObjectSchema.superRefine((value, ctx) => {
    if (value.content.length === 0 && value.attachments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A chat message must include text or at least one attachment.",
        path: ["content"],
      });
    }
  });
export type InterviewChatUserMessage = z.infer<
  typeof InterviewChatUserMessageSchema
>;

export const InterviewChatAssistantMessageSchema = z
  .object({
    ...InterviewChatMessageIdentitySchema,
    role: z.literal("assistant"),
    content: InterviewChatNonEmptyMessageContentSchema,
    replyToMessageId: InterviewChatIdSchema,
    attachments: z
      .array(InterviewChatImageAttachmentSchema)
      .max(interviewChatLimits.maxAttachmentsPerMessage)
      .default([]),
    usedAttachmentIds: z
      .array(InterviewChatIdSchema)
      .max(interviewChatLimits.maxAttachmentsPerMessage)
      .default([]),
  })
  .strict();
export type InterviewChatAssistantMessage = z.infer<
  typeof InterviewChatAssistantMessageSchema
>;

export const InterviewChatMessageSchema = z
  .discriminatedUnion("role", [
    InterviewChatUserMessageObjectSchema,
    InterviewChatAssistantMessageSchema,
  ])
  .superRefine((value, ctx) => {
    if (
      value.role === "user" &&
      value.content.length === 0 &&
      value.attachments.length === 0
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A chat message must include text or at least one attachment.",
        path: ["content"],
      });
    }
  });
export type InterviewChatMessage = z.infer<typeof InterviewChatMessageSchema>;

export const InterviewChatConversationSchema = z
  .object({
    id: InterviewChatIdSchema,
    sessionId: InterviewChatIdSchema.nullable().default(null),
    messages: z
      .array(InterviewChatMessageSchema)
      .max(interviewChatLimits.maxConversationMessages)
      .default([]),
    createdAt: IsoDateTimeSchema,
    updatedAt: IsoDateTimeSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const messageIds = new Set<string>();

    value.messages.forEach((message, index) => {
      if (messageIds.has(message.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Conversation message IDs must be unique.",
          path: ["messages", index, "id"],
        });
      }
      messageIds.add(message.id);

      if (message.conversationId !== value.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Message conversation ID must match its conversation.",
          path: ["messages", index, "conversationId"],
        });
      }

      if (message.sessionId !== value.sessionId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Message session ID must match its conversation.",
          path: ["messages", index, "sessionId"],
        });
      }
    });
  });
export type InterviewChatConversation = z.infer<
  typeof InterviewChatConversationSchema
>;

export const SendInterviewChatMessageInputSchema = z
  .object({
    conversationId: InterviewChatIdSchema,
    sessionId: InterviewChatIdSchema.nullable().default(null),
    content: InterviewChatMessageContentSchema.default(""),
    attachments: z
      .array(InterviewChatImageAttachmentInputSchema)
      .max(interviewChatLimits.maxAttachmentsPerMessage)
      .default([]),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.content.length === 0 && value.attachments.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A chat message must include text or at least one attachment.",
        path: ["content"],
      });
    }
  });
export type SendInterviewChatMessageInput = z.input<
  typeof SendInterviewChatMessageInputSchema
>;

export const InterviewChatTurnSchema = z
  .object({
    userMessage: InterviewChatUserMessageSchema,
    assistantMessage: InterviewChatAssistantMessageSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (
      value.userMessage.conversationId !== value.assistantMessage.conversationId
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chat turn messages must belong to the same conversation.",
        path: ["assistantMessage", "conversationId"],
      });
    }

    if (value.userMessage.sessionId !== value.assistantMessage.sessionId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Chat turn messages must belong to the same session.",
        path: ["assistantMessage", "sessionId"],
      });
    }

    if (value.assistantMessage.replyToMessageId !== value.userMessage.id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "Assistant reply must reference the user message in this turn.",
        path: ["assistantMessage", "replyToMessageId"],
      });
    }

    const userAttachmentIds = new Set(
      value.userMessage.attachments.map((attachment) => attachment.id),
    );
    value.assistantMessage.usedAttachmentIds.forEach((attachmentId, index) => {
      if (!userAttachmentIds.has(attachmentId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Assistant-used attachment IDs must reference the user message in this turn.",
          path: ["assistantMessage", "usedAttachmentIds", index],
        });
      }
    });
  });
export type InterviewChatTurn = z.infer<typeof InterviewChatTurnSchema>;
