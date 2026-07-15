import { describe, expect, test } from "vitest";

import {
  InterviewChatConversationSchema,
  InterviewChatImageAttachmentInputSchema,
  InterviewChatMessageSchema,
  InterviewChatTurnSchema,
  SendInterviewChatMessageInputSchema,
  interviewChatLimits,
} from "./interview-chat";

const now = "2026-07-12T10:00:00.000Z";

const imageInput = {
  source: "screenshot_capture" as const,
  fileName: "interview-screen.png",
  mimeType: "image/png" as const,
  dataBase64: "dGVzdA==",
  byteSize: 4,
  dimensions: {
    width: 1280,
    height: 720,
  },
};

const imageAttachment = {
  id: "attachment_1",
  kind: "image" as const,
  source: imageInput.source,
  fileName: imageInput.fileName,
  mimeType: imageInput.mimeType,
  byteSize: imageInput.byteSize,
  dimensions: imageInput.dimensions,
  retention: "temporary" as const,
  altText: "IDE showing the interview question and a code sample.",
  createdAt: now,
};

describe("interview chat contracts", () => {
  test("parses a text-and-screenshot send boundary", () => {
    const input = SendInterviewChatMessageInputSchema.parse({
      conversationId: "conversation_1",
      sessionId: "session_1",
      content: "How should I explain the trade-off shown in this screenshot?",
      attachments: [imageInput],
    });

    expect(input.attachments[0]?.source).toBe("screenshot_capture");
    expect(input.attachments[0]?.dimensions).toEqual({
      width: 1280,
      height: 720,
    });
  });

  test("allows an attachment-only user message but rejects an empty turn", () => {
    const attachmentOnly = InterviewChatMessageSchema.parse({
      id: "message_1",
      conversationId: "conversation_1",
      sessionId: null,
      role: "user",
      attachments: [imageAttachment],
      createdAt: now,
    });
    const emptyResult = SendInterviewChatMessageInputSchema.safeParse({
      conversationId: "conversation_1",
    });

    expect(attachmentOnly.role).toBe("user");
    expect(attachmentOnly.content).toBe("");
    expect(emptyResult.success).toBe(false);
  });

  test("keeps raw image bytes out of stored attachment metadata", () => {
    const message = InterviewChatMessageSchema.parse({
      id: "message_1",
      conversationId: "conversation_1",
      role: "user",
      content: "Use this screenshot as context.",
      attachments: [imageAttachment],
      createdAt: now,
    });

    expect(message.attachments[0]).not.toHaveProperty("dataBase64");
    expect(message.attachments[0]?.retention).toBe("temporary");
  });

  test("rejects unsupported images and mismatched payload sizes", () => {
    const unsupported = InterviewChatImageAttachmentInputSchema.safeParse({
      ...imageInput,
      mimeType: "image/svg+xml",
    });
    const mismatchedSize = InterviewChatImageAttachmentInputSchema.safeParse({
      ...imageInput,
      byteSize: 5,
    });

    expect(unsupported.success).toBe(false);
    expect(mismatchedSize.success).toBe(false);
  });

  test("bounds message text and attachment counts", () => {
    const tooLong = SendInterviewChatMessageInputSchema.safeParse({
      conversationId: "conversation_1",
      content: "x".repeat(interviewChatLimits.maxMessageCharacters + 1),
    });
    const tooManyAttachments = SendInterviewChatMessageInputSchema.safeParse({
      conversationId: "conversation_1",
      attachments: Array.from(
        { length: interviewChatLimits.maxAttachmentsPerMessage + 1 },
        () => imageInput,
      ),
    });

    expect(tooLong.success).toBe(false);
    expect(tooManyAttachments.success).toBe(false);
  });

  test("validates conversation ownership and assistant reply linkage", () => {
    const userMessage = {
      id: "message_user_1",
      conversationId: "conversation_1",
      sessionId: "session_1",
      role: "user" as const,
      content: "How should I answer this?",
      attachments: [imageAttachment],
      createdAt: now,
    };
    const assistantMessage = {
      id: "message_assistant_1",
      conversationId: "conversation_1",
      sessionId: "session_1",
      role: "assistant" as const,
      content:
        "Lead with the constraint, then describe the trade-off you chose.",
      replyToMessageId: userMessage.id,
      usedAttachmentIds: [imageAttachment.id],
      createdAt: now,
    };

    const conversation = InterviewChatConversationSchema.parse({
      id: "conversation_1",
      sessionId: "session_1",
      messages: [userMessage, assistantMessage],
      createdAt: now,
      updatedAt: now,
    });
    const turn = InterviewChatTurnSchema.parse({
      userMessage,
      assistantMessage,
    });
    const mismatchedConversation = InterviewChatConversationSchema.safeParse({
      id: "conversation_2",
      sessionId: "session_1",
      messages: [userMessage],
      createdAt: now,
      updatedAt: now,
    });
    const ungroundedAttachment = InterviewChatTurnSchema.safeParse({
      userMessage,
      assistantMessage: {
        ...assistantMessage,
        usedAttachmentIds: ["attachment_missing"],
      },
    });

    expect(conversation.messages).toHaveLength(2);
    expect(turn.assistantMessage.usedAttachmentIds).toEqual(["attachment_1"]);
    expect(mismatchedConversation.success).toBe(false);
    expect(ungroundedAttachment.success).toBe(false);
  });
});
