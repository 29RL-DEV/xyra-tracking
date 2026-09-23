// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Field, Input } from "@/components/ui/field";

afterEach(cleanup);

describe("Field", () => {
  it("gives every control a visible, associated label", () => {
    render(
      <Field label="Destination city" required>
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText(/Destination city/);
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("marks required and optional fields in words", () => {
    render(
      <Field label="Destination city" required>
        <Input />
      </Field>,
    );
    expect(screen.getByText("(required)")).toBeInTheDocument();
    expect(screen.queryByText("(optional)")).not.toBeInTheDocument();
    cleanup();

    render(
      <Field label="Weight (kg)" required={false}>
        <Input />
      </Field>,
    );
    expect(screen.getByText("(optional)")).toBeInTheDocument();
  });

  it("ties an error message and a hint to their input, and marks it invalid", () => {
    render(
      <Field
        label="Tracking number"
        required={false}
        hint="Leave blank and we will generate one."
        error="Something is wrong"
      >
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText(/Tracking number/);
    const message = screen.getByText("Something is wrong");
    const describedBy = input.getAttribute("aria-describedby") ?? "";

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(describedBy.split(" ")).toHaveLength(2);
    expect(describedBy).toContain(message.id);
    expect(describedBy).toContain(
      screen.getByText("Leave blank and we will generate one.").id,
    );
  });

  it("leaves a valid input unmarked", () => {
    render(
      <Field label="Destination city" required>
        <Input />
      </Field>,
    );

    const input = screen.getByLabelText(/Destination city/);
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
  });
});
