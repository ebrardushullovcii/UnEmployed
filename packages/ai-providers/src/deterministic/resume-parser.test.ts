import { describe, expect, test } from "vitest";
import { createPreferences, createProfile } from "../test-fixtures";
import { buildDeterministicResumeProfileExtraction } from "./resume-parser";
import { EBRAR_IMPORTED_TEXT } from "../resume-import-fixtures";

describe("buildDeterministicResumeProfileExtraction", () => {
  test("uses ABOUT ME content as the summary body", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "Ebrar Dushullovci",
          "Address: Prishtina, Kosovo (Home)",
          "ABOUT ME",
          "A passionate software developer with 6+ years of full-stack experience building impactful solutions using React, Next.js,",
          "Node.js, .NET Core, SQL Server and AWS/Azure.",
          "WORK EXPERIENCE",
          "AUTOMATEDPROS – PRISHTINA, KOSOVO",
          "SENIOR FULL-STACK SOFTWARE ENGINEER – 07/2023 – Current",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
    );

    expect(extraction.summary).toContain("A passionate software developer with 6+ years of full-stack experience");
    expect(extraction.summary).toContain("AWS/Azure");
    expect(extraction.currentLocation).toBe("Prishtina, Kosovo");
  });

  test("splits inline company and location details from combined experience headers", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "WORK EXPERIENCE",
          ".NET DEVELOPER – CREA-KO – 01/2019 – 07/2019 – PRISHTINA, KOSOVO",
          "• Assisted in migrating a web-based ERP system from .NET Framework to .NET Core MVC, refactoring both front-end",
          "and back-end code to enhance performance, scalability, and alignment with the .NET Core MVC architecture.",
          "TECHNICAL SUPPORT AGENT – BIT BY BIT – 06/2017 – 12/2017 – PRISHTINA, KOSOVO",
          "• Resolved IPTV incidents with a 92 % first-call resolution rate across 40+ tickets/day.",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
    );

    expect(extraction.experiences[0]).toMatchObject({
      title: ".NET Developer",
      companyName: "CREA-KO",
      location: "Prishtina, Kosovo",
      startDate: "01/2019",
      endDate: "07/2019",
    });
    expect(
      [extraction.experiences[0]?.summary ?? "", ...(extraction.experiences[0]?.achievements ?? [])].join(" "),
    ).toContain("refactoring both front-end");
    expect(extraction.experiences[1]).toMatchObject({
      title: "Technical Support Agent",
      companyName: "BIT BY BIT",
      location: "Prishtina, Kosovo",
      startDate: "06/2017",
      endDate: "12/2017",
    });
  });

  test("extracts realistic fixture text for plan 019 benchmark coverage", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: EBRAR_IMPORTED_TEXT,
      },
      "deterministic",
      "Test provider",
    );

    expect(extraction.fullName).toBe("Ebrar Dushullovci");
    expect(extraction.currentLocation).toBe("Prishtina, Kosovo");
    expect(extraction.summary).toContain("6+ years of full-stack experience");
    expect(extraction.experiences.some((entry) => entry.companyName === "AUTOMATEDPROS")).toBe(true);
  });

  test("parses professional experience headings and inline date headers", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "Ryan Holstien",
          "PROFESSIONAL EXPERIENCE",
          "Senior Software Engineer — DataHub, Remote, CA (Dec 2021–Feb 2026)",
          "Designed C# and .NET services for a behavioral-health platform.",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
      { preserveExistingValues: false },
    );

    expect(extraction.experiences[0]).toMatchObject({
      title: "Senior Software Engineer",
      companyName: "DataHub",
      location: "Remote, CA",
      startDate: "Dec 2021",
      endDate: "Feb 2026",
    });
  });

  test("infers undated experience entries from company then role lines", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "Experience",
          "Signal Systems",
          "Staff Frontend Engineer",
          "Built React and TypeScript foundations for product teams.",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
      { preserveExistingValues: false },
    );

    expect(extraction.experiences[0]).toMatchObject({
      companyName: "Signal Systems",
      title: "Staff Frontend Engineer",
    });
  });

  test("parses school-first education lines with adjacent dates", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "Aaron Murphy",
          "EDUCATION",
          "Florida State University — Bachelor’s Degree in Computer Science and Physics",
          "May 2011 - Sept 2015",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
      { preserveExistingValues: false },
    );

    expect(extraction.education[0]).toMatchObject({
      schoolName: "Florida State University",
      degree: "Bachelor’s Degree",
      fieldOfStudy: "Computer Science and Physics",
      startDate: "May 2011",
      endDate: "Sept 2015",
    });
  });

  test("parses degree-first education lines with embedded college names", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "EDUCATION AND TRAINING",
          "Prishtina, Kosovo",
          "BACHELOR'S DEGREE, COMPUTER SCIENCE Kolegji Riinvest (Riinvest College)",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
      { preserveExistingValues: false },
    );

    expect(extraction.education[0]).toMatchObject({
      schoolName: "Kolegji Riinvest (Riinvest College)",
      degree: "BACHELOR'S DEGREE",
      fieldOfStudy: "COMPUTER SCIENCE",
      location: "Prishtina, Kosovo",
    });
  });

  test("starts a new experience block when a new header appears before the next date line", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "EXPERIENCE",
          "EdSights, Remote, NY — Staff/Senior Software Engineer",
          "Sep 2021 – Feb 2026",
          "● Led the design and implementation of scalable cloud-native applications.",
          "Agile Thought, Tampa, FL — Senior Software Developer",
          "Jul 2019 - Sep 2021",
          "● Built and scaled front-end applications using React and TypeScript.",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
      { preserveExistingValues: false },
    );

    expect(extraction.experiences[0]).toMatchObject({
      companyName: "EdSights",
      title: "Staff/Senior Software Engineer",
    });
    expect(extraction.experiences[1]).toMatchObject({
      companyName: "Agile Thought",
      title: "Senior Software Developer",
      location: "Tampa, FL",
      startDate: "Jul 2019",
      endDate: "Sep 2021",
    });
  });

  test("repairs run-on Ebrar extraction lines before parsing later experience headers", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "WORK EXPERIENCE",
          "AUTOMATEDPROS - PRISHTINA, KOSOVO",
          "SENIOR FULL-STACK SOFTWARE ENGINEER - 07/2023 - Current",
          "• Built a centralized dashboard with ShadCN components for logging outcomes.",
          "CHIEF EXPERIENCE OFFICER - 11/2021 - 07/2023",
          "• Managed the delivery of product updates, ensuring QA testing coverage and that support teams were fully equipped.",
          "INFOTECH L.L.C - PRISHTINA, KOSOVO.NET CONSULTANT - 01/2022 - Current",
          "• Authored quick-fix patches that restored business-critical services within 2 h of incident notification, maintaining 99.9 % uptime..NET DEVELOPER - 08/2019 - 01/2022",
          "• Supported and enhanced a comprehensive .NET desktop application for business management.",
          "• Project Lead (.NET MVC) - Logistics & Delivery Web Solution: designed user registration, order placement, real-time tracking, responsive UI, and optimized database for high-volume order processing..NET DEVELOPER - CREA-KO - 01/2019 - 07/2019 - PRISHTINA, KOSOVO",
          "• Assisted in migrating a web-based ERP system from .NET Framework to .NET Core MVC.",
          "BEAUTYQUE - PRISHTINA, KOSOVO",
          "PROJECT MANAGER - 04/2018 - 12/2018",
          "DIGITAL MARKETING MANAGER - 12/2017 - 04/2018",
          "TECHNICAL SUPPORT AGENT - BIT BY BIT - 06/2017 - 12/2017 - PRISHTINA, KOSOVO",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
      { preserveExistingValues: false },
    );

    const titles = extraction.experiences.map((entry) => entry.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        ".NET Consultant",
        ".NET Developer",
        "Project Manager",
        "Digital Marketing Manager",
        "Technical Support Agent",
      ]),
    );
    expect(extraction.experiences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: ".NET Consultant",
          companyName: "INFOTECH L.L.C",
          startDate: "01/2022",
          isCurrent: true,
        }),
        expect.objectContaining({
          title: ".NET Developer",
          startDate: "08/2019",
          endDate: "01/2022",
        }),
        expect.objectContaining({
          title: ".NET Developer",
          companyName: "CREA-KO",
          startDate: "01/2019",
          endDate: "07/2019",
        }),
      ]),
    );
    expect(titles.some((title) => title?.includes("Prishtina, Kosovo.net"))).toBe(false);
    expect(titles.some((title) => title?.includes("99.9 % Uptime"))).toBe(false);
    expect(titles.some((title) => title?.includes("Real-time Tracking"))).toBe(false);
  });

  test("repairs the real extracted Ebrar PDF text around INFOTECH and CREA-KO", () => {
    const extraction = buildDeterministicResumeProfileExtraction(
      {
        existingProfile: createProfile(),
        existingSearchPreferences: createPreferences(),
        resumeText: [
          "WORK EXPERIENCE",
          "AUTOMATEDPROS – PRISHTINA, KOSOVO",
          "SENIOR FULL-STACK SOFTWARE ENGINEER – 07/2023 – Current",
          "• Engineered a real-time restaurant order platform.",
          "• Integrated the platform with the company's project-management tool through REST APIs so failed tests automatically created and assigned tickets, eliminating manual triage and ensuring rapid resolution.",
          "CHIEF EXPERIENCE OFFICER – 11/2021 – 07/2023",
          "• Managed the delivery of product updates, ensuring QA testing coverage and that support teams were fully equipped with knowledge of new features before deployment.",
          "INFOTECH L.L.C – PRISHTINA, KOSOVO.NET CONSULTANT – 01/2022 – Current",
          "• Provide on-call architecture and performance triage, cutting query response times by up to 60 % in critical workflows.",
          "• Authored quick-fix patches that restored business-critical services within 2 h of incident notification, maintaining 99.9 % uptime..NET DEVELOPER – 08/2019 – 01/2022",
          "• Supported and enhanced a comprehensive.NET desktop application for business management covering inventory, sales, tax documentation, POS, restaurant orders, car repair, and fuel-pump control.",
          "• Project Lead (.NET MVC) – Logistics & Delivery Web Solution: designed user registration, order placement, real-time tracking, responsive UI, and optimized database for high-volume order processing..NET DEVELOPER – CREA-KO – 01/2019 – 07/2019 – PRISHTINA, KOSOVO",
          "• Assisted in migrating a web-based ERP system from.NET Framework to.NET Core MVC, refactoring both front-end and back-end code to enhance performance.",
          "BEAUTYQUE – PRISHTINA, KOSOVO",
          "PROJECT MANAGER – 04/2018 – 12/2018",
          "DIGITAL MARKETING MANAGER – 12/2017 – 04/2018",
        ].join("\n"),
      },
      "deterministic",
      "Test provider",
      { preserveExistingValues: false },
    );

    const titles = extraction.experiences.map((entry) => entry.title);

    expect(titles).toEqual(
      expect.arrayContaining([
        ".NET Consultant",
        ".NET Developer",
        "Project Manager",
        "Digital Marketing Manager",
      ]),
    );
    expect(extraction.experiences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: ".NET Consultant",
          companyName: "INFOTECH L.L.C",
          location: "Prishtina, Kosovo",
          startDate: "01/2022",
          isCurrent: true,
        }),
        expect.objectContaining({
          title: ".NET Developer",
          companyName: "CREA-KO",
          location: "Prishtina, Kosovo",
          startDate: "01/2019",
          endDate: "07/2019",
        }),
      ]),
    );
    expect(titles.some((title) => title?.includes("Prishtina, Kosovo.net"))).toBe(false);
    expect(titles.some((title) => title?.includes("99.9 % Uptime"))).toBe(false);
    expect(titles.some((title) => title?.includes("Real-time Tracking"))).toBe(false);
  });
});
