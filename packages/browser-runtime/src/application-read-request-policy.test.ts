import { describe, expect, test } from "vitest";
import {
  carriesPreparedValue,
  isGraphQlReadBody,
  isPageOwnedReadRequest,
} from "./application-read-request-policy";

describe("page-owned read policy", () => {
  const prepared = ["Jamie Rivers", "jamie@example.com", "+49 555 0000000"];

  test("allows safe-method reads with or without a query when nothing prepared rides along", () => {
    for (const url of [
      "https://site.test/lang/en-US.json",
      "https://site.test/api/applications?type=active&posting=R1",
      "https://cdn.test/.vite/manifest.json",
    ]) {
      expect(
        isPageOwnedReadRequest({
          method: "GET",
          url,
          preparedValues: prepared,
        }),
      ).toBe(true);
    }
    expect(
      isPageOwnedReadRequest({
        method: "HEAD",
        url: "https://site.test/ping",
        preparedValues: prepared,
      }),
    ).toBe(true);
  });

  test("refuses a read that carries a prepared value, encoded or not", () => {
    expect(
      isPageOwnedReadRequest({
        method: "GET",
        url: "https://site.test/collect?email=jamie%40example.com",
        preparedValues: prepared,
      }),
    ).toBe(false);
    expect(
      isPageOwnedReadRequest({
        method: "GET",
        url: "https://site.test/autosave/Jamie Rivers",
        preparedValues: prepared,
      }),
    ).toBe(false);
    expect(carriesPreparedValue("x=ab", ["ab"])).toBe(false);
  });

  test("recognizes GraphQL query documents and rejects mutations", () => {
    expect(
      isGraphQlReadBody(
        JSON.stringify({
          operationName: "ApiOrganizationFromHostedJobsPageName",
          query:
            "# hosted page\nquery ApiOrganizationFromHostedJobsPageName($name: String!) { organization(name: $name) { id } }",
          variables: { name: "constructor" },
        }),
      ),
    ).toBe(true);
    expect(
      isGraphQlReadBody(JSON.stringify({ query: "{ viewer { id } }" })),
    ).toBe(true);
    expect(
      isGraphQlReadBody(
        JSON.stringify([
          { query: "query A { a }" },
          { query: "mutation SubmitApplication { submit { id } }" },
        ]),
      ),
    ).toBe(false);
    expect(
      isGraphQlReadBody(JSON.stringify({ query: "subscription { tick }" })),
    ).toBe(false);
    expect(isGraphQlReadBody('{"answers":{"email":"x"}}')).toBe(false);
    expect(isGraphQlReadBody("not json")).toBe(false);
  });

  test("allows a GraphQL read POST only when it carries nothing prepared", () => {
    const clean = JSON.stringify({
      query: "query Posting($id: ID!) { posting(id: $id) { title } }",
      variables: { id: "R1" },
    });
    const leaking = JSON.stringify({
      query: "query Check($email: String!) { exists(email: $email) }",
      variables: { email: "jamie@example.com" },
    });
    expect(
      isPageOwnedReadRequest({
        method: "POST",
        url: "https://site.test/api/graphql",
        bodyText: clean,
        preparedValues: prepared,
      }),
    ).toBe(true);
    expect(
      isPageOwnedReadRequest({
        method: "POST",
        url: "https://site.test/api/graphql",
        bodyText: leaking,
        preparedValues: prepared,
      }),
    ).toBe(false);
    expect(
      isPageOwnedReadRequest({
        method: "POST",
        url: "https://site.test/api/save",
        bodyText: '{"firstName":"Jamie"}',
        preparedValues: prepared,
      }),
    ).toBe(false);
    expect(
      isPageOwnedReadRequest({
        method: "PUT",
        url: "https://site.test/api/graphql",
        bodyText: clean,
        preparedValues: prepared,
      }),
    ).toBe(false);
  });
});
