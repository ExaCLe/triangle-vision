describe("simple testing workflow", () => {
  it("inputting a file, correct answer, correct results showing", () => {
    cy.visit("http://localhost:3000/?file=Testfile.csv");
    cy.get("[data-testid=fileInput]").attachFile("Testfile.csv");
    // locate the Start button by text and click it
    cy.wait(1000);
    cy.contains("Start").click();

    // check if the triangle is shown
    cy.get("[data-testid=triangleN]").should("be.visible");
    // check if the circle is shown
    cy.get("[data-testid=circle]").should("be.visible");

    // press the arrow up key
    cy.get("body").type("{uparrow}");

    // search for the final results by text
    cy.contains("100 %").should("be.visible");
    cy.contains("1 correct").should("be.visible");
    cy.contains("0 incorrect").should("be.visible");
  });

  it("inputting a file, incorrect answer, correct results showing", () => {
    cy.visit("http://localhost:3000");
    cy.get("[data-testid=fileInput]").attachFile("Testfile.csv");
    // locate the Start button by text and click it
    cy.contains("Start").click();

    // check if the triangle is shown
    cy.get("[data-testid=triangleN]").should("be.visible");
    // check if the circle is shown
    cy.get("[data-testid=circle]").should("be.visible");

    // press the arrow down key
    cy.get("body").type("{downarrow}");

    // search for the final results by text
    cy.contains("0 %").should("exist");
    cy.contains("0 correct").should("be.visible");
    cy.contains("1 incorrect").should("be.visible");
  });

  it("the triangle hides after 1000ms after pressing start", () => {
    cy.clock();
    cy.visit("http://localhost:3000");
    cy.get("[data-testid=fileInput]").attachFile("Testfile.csv");
    cy.contains("Start").click();

    // wait 999ms
    cy.tick(999);
    // check if the triangle is still visible
    cy.get("[data-testid=triangleN]").should("be.visible");

    // wait 1ms
    cy.tick(1);

    // check if the triangle is not visible
    cy.get("[data-testid=triangleN]").should("not.exist");

    // press the arrow up key
    cy.get("body").type("{uparrow}");

    // search for the final results by text
    cy.contains("100 %").should("exist");
    cy.contains("1 correct").should("be.visible");
    cy.contains("0 incorrect").should("be.visible");
  });

  it("the waiting period is correct and it shows the correct reaction time", () => {
    cy.clock();
    cy.visit("http://localhost:3000");
    cy.get("[data-testid=fileInput]").attachFile("Testfile2.csv");
    // input a waiting period of 1000ms
    cy.get("[data-testid=breakInput]").type("1000");
    cy.contains("Start").click();

    // wait 950ms
    cy.tick(950);
    // press the arrow up key
    cy.get("body").type("{uparrow}");

    // check if the reaction time of 950 ms is shown
    cy.contains("950 ms").should("be.visible");
  });

  it('it displays the text "correct" in green after correct answer and "incorrect" after a wrong answer', () => {
    cy.clock();
    cy.visit("http://localhost:3000");
    cy.get("[data-testid=fileInput]").attachFile("Testfile3.csv");

    // input a waiting period of 1000ms
    cy.get("[data-testid=breakInput]").type("1000");
    cy.contains("Start").click();

    // input a correct answer
    cy.get("body").type("{uparrow}");

    // check if the text "correct" is shown in green
    cy.get("[data-testid=answerFeedback]").should(
      "have.css",
      "color",
      "rgb(0, 128, 0)"
    );
    cy.get("[data-testid=answerFeedback]").should("contain.text", "Correct!");

    // input a wrong answer
    cy.get("body").type("{downarrow}");

    // check if the text "incorrect" is shown in red
    cy.get("[data-testid=answerFeedback]").should(
      "have.css",
      "color",
      "rgb(255, 0, 0)"
    );
    cy.get("[data-testid=answerFeedback]").should("contain.text", "Incorrect!");
  });
});
