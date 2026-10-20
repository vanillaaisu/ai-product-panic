# AI Workshop

A small facilitator-led icebreaker for university AI workshops, presented as **AI Product Panic!** Teams draw an audience, a problem, and a wonderfully awkward constraint, then invent and pitch an AI product.

## Open the app

Open `index.html` in a modern browser, or open this folder in Visual Studio Code and launch `index.html` with Live Server. The welcome screen remains visible until you select **Let's begin**. Use Live Server to display the optional logo; browsers do not reliably load local images when the page is opened directly as a `file://` URL. There is no database, backend, login, installation, or package setup.

The society logo is `society-logo.jpg` in the same folder as `index.html`. Keep the JPG there so it loads automatically, including when opening the app directly in a browser.

## Facilitator flow

1. On the welcome screen, select **Let's begin**. In **Draw**, enter a unique team name and select **Reveal the brief**. Use **Shuffle again** to draw a different brief; drawing never starts a timer.
2. Select **Copy brief** to share the prompts, then **Add team to the board** to save the challenge.
3. In **Teams**, open a team. Select **Start** when the team is ready for its six-minute build sprint. You can switch to another team and start its timer; each team's timer continues independently. Pause, resume, reset, or finish early as needed.
4. The pitch does not start automatically. When a team is ready, open the pitch stage and select **Start the pitch** for the 2-minute-30-second timer. Each team's pitch timer also runs independently. Pause, resume, reset, or end early as needed.
5. After a pitch, select **Mark pitch complete** or return to the board. The board also lets you change a team's status, edit its name, regenerate its challenge, delete it, or start a new team.
6. Expand **Shape the prompt deck** to add or remove custom prompts. **Restore default cards** removes custom prompts. Custom cards are stored in this browser separately from the Team Board.

**Reset Entire Workshop** is at the bottom of **Teams**. After confirmation, it deletes all saved teams and challenges and resets both timers. Built-in and custom prompt cards are kept.

The AI Workshop welcome screen appears whenever the page opens or refreshes and stays there until **Let's begin** is pressed. Completion sounds are off until enabled with the sound button.

## Local storage

The Team Board and custom prompts use this browser’s `localStorage`; data is not synchronised or sent to a server. Clearing browser storage removes the saved data.
