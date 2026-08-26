// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, FieldLabel } from "./field";

describe("Field", () => {
  afterEach(cleanup);

  it("uses a neutral wrapper and preserves explicit control naming", () => {
    const { container } = render(
      <Field data-testid="field-wrapper">
        <FieldLabel htmlFor="field-control">Email</FieldLabel>
        <input id="field-control" />
      </Field>,
    );

    expect(screen.getByTestId("field-wrapper").tagName).toBe("DIV");
    expect(screen.getByLabelText("Email").id).toBe("field-control");
    expect(container.querySelector("label label")).toBeNull();
  });
});
