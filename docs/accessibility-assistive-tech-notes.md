# FairValue Assistive Technology Notes

Last captured: 2026-05-11

## Scope

This file records a local assistive-technology evidence pass for the rendered FairValue room flow.

- Source app: Vite frontend on `http://127.0.0.1:64036`
- Backend: Express/WebSocket server on `http://127.0.0.1:64034`
- Room captured: `N5A8`
- Browser: Playwright Google Chrome for Testing, headed, with `--force-renderer-accessibility`
- Platform evidence: macOS System Events accessibility tree for the Chrome window
- Snapshot evidence: Playwright `ariaSnapshot({ mode: 'ai' })`

The Browser plugin was listed but its required JavaScript browser-control runtime was not exposed in this session, so this pass used the repo Playwright path. No non-disruptive VoiceOver speech-output CLI was available; this pass verifies the macOS accessibility tree that VoiceOver consumes, but it is not a substitute for a human listening to VoiceOver output and using the rotor.

## Result

| Surface | Required accessible names in macOS AX tree | Result |
|---|---|---|
| /join pick screen | `FairValue`<br>`Create Room`<br>`Join Room` | PASS |
| /join create-room form | `Host nickname`<br>`Property address`<br>`Asking price`<br>`Back`<br>`Create Room` | PASS |
| /host room dashboard | `N5A8`<br>`88 Assistive Tech Way`<br>`AI bot disabled`<br>`Settle`<br>`Connected`<br>`Market Probability` | PASS |
| /host settle modal | `Settle Market`<br>`Actual price`<br>`Cancel` | PASS |
| /play join form | `Join Game`<br>`N5A8`<br>`88 Assistive Tech Way`<br>`Player nickname`<br>`Join Room` | PASS |
| /play betting controls | `Custom wager`<br>`Set wager to $100`<br>`Bet $25 on OVER`<br>`Bet $25 on UNDER` | PASS |

## Manual VoiceOver Checklist

Run this checklist with VoiceOver enabled before a public demo or release:

1. On `/join`, use VO+Right from the top of the page. Confirm VoiceOver announces the FairValue heading, Create Room, and Join Room in that order.
2. Activate Create Room. Confirm focus lands on Host nickname, then reaches Property address, Asking price, Back, and Create Room in a useful order.
3. Create a room. Confirm the host screen announces room code, player count, connection status, AI toggle state, Settle, property address, probability, leaderboard, activity, QR/public URL controls, and AI analyst controls.
4. Open Settle. Confirm the dialog is announced as Settle Market, focus starts on Actual price, Escape closes the dialog, and focus returns to Settle.
5. Open `/play/:roomCode` on a narrow viewport. Confirm Join Game, the room code, property address, Player nickname, and Join Room are announced.
6. Join as a player. Confirm the probability meter announces the percentage, wager presets announce dollar amounts, Custom wager is editable, and OVER/UNDER buttons include the current wager in their names.
7. Trigger the missing-key AI fallback. Confirm the degraded response is announced as an alert and does not trap focus.

## Captured Evidence

### /join pick screen

macOS AX excerpt:

```text
AXHeading: FairValue
AXStaticText: FairValue
AXStaticText: Real Estate Prediction Market
AXButton: Create Room Host a game on TV/projector
AXStaticText: Create Room
AXStaticText: Host a game on TV/projector
AXButton: Join Room Play from your phone
AXStaticText: Join Room
AXStaticText: Play from your phone
AXButton: Browse Markets
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img [ref=e6]
      - heading "FairValue" [level=1] [ref=e9]
      - paragraph [ref=e10]: Real Estate Prediction Market
    - generic [ref=e11]:
      - button "Create Room Host a game on TV/projector" [ref=e12] [cursor=pointer]:
        - img [ref=e13]
        - generic [ref=e14]: Create Room
        - generic [ref=e15]: Host a game on TV/projector
      - button "Join Room Play from your phone" [ref=e16] [cursor=pointer]:
        - img [ref=e17]
        - generic [ref=e20]: Join Room
        - generic [ref=e21]: Play from your phone
  - button "Browse Markets" [ref=e23] [cursor=pointer]:
    - img [ref=e24]
    - text: Browse Markets
```

### /join create-room form

macOS AX excerpt:

```text
AXHeading: FairValue
AXStaticText: FairValue
AXStaticText: Real Estate Prediction Market
AXHeading: Create a Room
AXStaticText: Create a Room
AXStaticText: YOUR NICKNAME
AXTextField: Host nickname
AXStaticText: PROPERTY ADDRESS
AXTextField: Property address
AXStaticText: ASKING PRICE ($)
AXTextField: Asking price
AXButton: Create Room
AXButton: Back
AXButton: Browse Markets
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img [ref=e6]
      - heading "FairValue" [level=1] [ref=e9]
      - paragraph [ref=e10]: Real Estate Prediction Market
    - generic [ref=e29]:
      - heading "Create a Room" [level=2] [ref=e30]
      - generic [ref=e31]:
        - generic [ref=e32]: Your Nickname
        - textbox "Host nickname" [active] [ref=e33]:
          - /placeholder: Enter your name
      - generic [ref=e34]:
        - generic [ref=e35]: Property Address
        - textbox "Property address" [ref=e36]:
          - /placeholder: 742 Evergreen Terrace
      - generic [ref=e37]:
        - generic [ref=e38]: Asking Price ($)
        - textbox "Asking price" [ref=e39]:
          - /placeholder: 450,000
      - button "Create Room" [ref=e40] [cursor=pointer]
      - button "Back" [ref=e41] [cursor=pointer]
  - button "Browse Markets" [ref=e23] [cursor=pointer]:
    - img [ref=e24]
    - text: Browse Markets
```

### /host room dashboard

macOS AX excerpt:

```text
AXStaticText: N5A8
AXStaticText: 1
AXStaticText:  player
AXStaticText: Connected
AXCheckBox: AI bot disabled
AXButton: Settle
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking:
AXStaticText: $
AXStaticText: 720,000
AXStaticText: 50
AXStaticText: %
AXStaticText: THINK OVER
AXStaticText: Market Probability
AXStaticText: OVER probability
AXStaticText: Fair value ($)
AXGroup: Charting by TradingView
AXLink: Charting by TradingView
AXStaticText: TOTAL TRADES
AXStaticText: 0
AXStaticText: VOLUME
AXStaticText: AVG BET
AXStaticText: AI ANALYST
AXButton: Analyze all bets
AXButton: Suggest a bet
AXButton: Market summary
AXTextField: Ask AI analyst
AXButton: Send AI analyst question
AXStaticText: SCAN TO JOIN
AXStaticText: http://127.0.0.1:64036/play/N5A8
AXStaticText: NGROK / PUBLIC URL
AXTextField: Public join URL override
AXStaticText: LEADERBOARD
AXStaticText: #
AXStaticText: AX Host
AXStaticText: 1000
AXStaticText: ACTIVITY
AXStaticText:  joined
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: N5A8
      - generic [ref=e7]:
        - img [ref=e8]
        - text: 1 player
      - status [ref=e13]:
        - generic [ref=e15]: Connected
    - generic [ref=e16]:
      - button "AI bot disabled" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - text: AI OFF
      - button "Settle" [ref=e21] [cursor=pointer]:
        - img [ref=e22]
        - text: Settle
  - generic [ref=e28]:
    - generic [ref=e29]:
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: 88 Assistive Tech Way
          - generic [ref=e34]:
            - text: "Asking:"
            - strong [ref=e35]: $720,000
        - generic [ref=e36]:
          - generic [ref=e37]: 50%
          - generic [ref=e38]: think OVER
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e41]: Market Probability
          - generic [ref=e42]:
            - text: OVER probability
            - text: Fair value ($)
        - table [ref=e47]:
          - row "Charting by TradingView" [ref=e48]:
            - cell [ref=e49]
            - cell "Charting by TradingView" [ref=e53]:
              - link "Charting by TradingView" [ref=e57] [cursor=pointer]:
                - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/host/N5A8
                - img [ref=e58]
            - cell [ref=e62]
        - generic [ref=e66]:
          - generic [ref=e67]:
            - generic [ref=e68]: Total Trades
            - generic [ref=e69]: "0"
          - generic [ref=e70]:
            - generic [ref=e71]: Volume
            - generic [ref=e72]: $0
          - generic [ref=e73]:
            - generic [ref=e74]: Avg Bet
            - generic [ref=e75]: $0
      - generic [ref=e76]:
        - generic [ref=e77]:
          - img [ref=e78]
          - text: AI Analyst
        - generic [ref=e81]:
          - button "Analyze all bets" [ref=e82] [cursor=pointer]:
            - img [ref=e83]
            - text: Analyze all bets
          - button "Suggest a bet" [ref=e85] [cursor=pointer]:
            - img [ref=e86]
            - text: Suggest a bet
          - button "Market summary" [ref=e89] [cursor=pointer]:
            - img [ref=e90]
            - text: Market summary
        - generic [ref=e92]:
          - textbox "Ask AI analyst" [ref=e93]:
            - /placeholder: Ask about this market...
          - button "Send AI analyst question" [disabled] [ref=e94] [cursor=pointer]:
            - img [ref=e95]
    - generic [ref=e98]:
      - generic [ref=e99]:
        - generic [ref=e100]: Scan to Join
        - img "Join room QR code" [ref=e102]
        - generic [ref=e105]: http://127.0.0.1:64036/play/N5A8
        - generic [ref=e106]:
          - generic [ref=e107]: Ngrok / Public URL
          - textbox "Public join URL override" [ref=e108]:
            - /placeholder: https://abcd-1234.ngrok-free.app
      - generic [ref=e109]:
```

### /host settle modal

macOS AX excerpt:

```text
AXGroup: Settle Market
AXHeading: Settle Market
AXStaticText: Settle Market
AXStaticText: Enter the actual appraisal/sale price to determine the winner.
AXStaticText: ACTUAL PRICE ($)
AXTextField: Actual price
AXStaticText: Asking: $
AXStaticText: 720,000
AXStaticText:  —
AXStaticText:
AXStaticText: enter a price
AXButton: Cancel
AXButton: Confirm Settlement
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: N5A8
      - generic [ref=e7]:
        - img [ref=e8]
        - text: 1 player
      - status [ref=e13]:
        - generic [ref=e15]: Connected
    - generic [ref=e16]:
      - button "AI bot disabled" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - text: AI OFF
      - button "Settle" [ref=e21] [cursor=pointer]:
        - img [ref=e22]
        - text: Settle
  - generic [ref=e28]:
    - generic [ref=e29]:
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: 88 Assistive Tech Way
          - generic [ref=e34]:
            - text: "Asking:"
            - strong [ref=e35]: $720,000
        - generic [ref=e36]:
          - generic [ref=e37]: 50%
          - generic [ref=e38]: think OVER
      - generic [ref=e39]:
        - generic [ref=e40]:
          - generic [ref=e41]: Market Probability
          - generic [ref=e42]:
            - text: OVER probability
            - text: Fair value ($)
        - table [ref=e47]:
          - row "Charting by TradingView" [ref=e48]:
            - cell [ref=e49]
            - cell "Charting by TradingView" [ref=e53]:
              - link "Charting by TradingView" [ref=e57] [cursor=pointer]:
                - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/host/N5A8
                - img [ref=e58]
            - cell [ref=e62]
        - generic [ref=e66]:
          - generic [ref=e67]:
            - generic [ref=e68]: Total Trades
            - generic [ref=e69]: "0"
          - generic [ref=e70]:
            - generic [ref=e71]: Volume
            - generic [ref=e72]: $0
          - generic [ref=e73]:
            - generic [ref=e74]: Avg Bet
            - generic [ref=e75]: $0
      - generic [ref=e76]:
        - generic [ref=e77]:
          - img [ref=e78]
          - text: AI Analyst
        - generic [ref=e81]:
          - button "Analyze all bets" [ref=e82] [cursor=pointer]:
            - img [ref=e83]
            - text: Analyze all bets
          - button "Suggest a bet" [ref=e85] [cursor=pointer]:
            - img [ref=e86]
            - text: Suggest a bet
          - button "Market summary" [ref=e89] [cursor=pointer]:
            - img [ref=e90]
            - text: Market summary
        - generic [ref=e92]:
          - textbox "Ask AI analyst" [ref=e93]:
            - /placeholder: Ask about this market...
          - button "Send AI analyst question" [disabled] [ref=e94] [cursor=pointer]:
            - img [ref=e95]
    - generic [ref=e98]:
      - generic [ref=e99]:
        - generic [ref=e100]: Scan to Join
        - img "Join room QR code" [ref=e102]
        - generic [ref=e105]: http://127.0.0.1:64036/play/N5A8
        - generic [ref=e106]:
          - generic [ref=e107]: Ngrok / Public URL
          - textbox "Public join URL override" [ref=e108]:
            - /placeholder: https://abcd-1234.ngrok-free.app
      - generic [ref=e109]:
```

### /play join form

macOS AX excerpt:

```text
AXStaticText: Join Game
AXStaticText: N5A8
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking: $
AXStaticText: 720,000
AXStaticText: YOUR NAME
AXTextField: Player nickname
AXButton: Join Room
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e4]:
  - generic [ref=e5]: Join Game
  - generic [ref=e6]: N5A8
  - generic [ref=e7]:
    - generic [ref=e8]: 88 Assistive Tech Way
    - generic [ref=e9]: "Asking: $720,000"
  - generic [ref=e10]:
    - generic [ref=e11]: Your Name
    - textbox "Player nickname" [active] [ref=e12]:
      - /placeholder: Enter your name
  - button "Join Room" [ref=e13] [cursor=pointer]
```

### /play betting controls

macOS AX excerpt:

```text
AXStaticText: N5A8
AXStaticText: Connected
AXStaticText: 1,000
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking: $
AXStaticText: 720,000
AXStaticText: 50
AXStaticText: % OVER
AXStaticText: % UNDER
AXStaticText: Market Probability
AXStaticText: Over %
AXStaticText: Fair value
AXGroup: Charting by TradingView
AXLink: Charting by TradingView
AXButton: Set wager to $10
AXStaticText: $
AXStaticText: 10
AXButton: Set wager to $25
AXStaticText: 25
AXButton: Set wager to $50
AXButton: Set wager to $100
AXStaticText: 100
AXButton: Bet $25 on OVER
AXButton: Bet $25 on UNDER
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: N5A8
      - status [ref=e7]:
        - generic [ref=e9]: Connected
    - generic [ref=e10]:
      - img [ref=e11]
      - generic [ref=e13]: 1,000
  - generic [ref=e14]:
    - generic [ref=e15]: 88 Assistive Tech Way
    - generic [ref=e16]: "Asking: $720,000"
  - generic [ref=e17]:
    - progressbar "50% probability of going over asking price" [ref=e18]
    - generic [ref=e20]:
      - generic [ref=e21]: 50% OVER
      - generic [ref=e22]: 50% UNDER
  - generic [ref=e23]:
    - generic [ref=e24]:
      - generic [ref=e25]: Market Probability
      - generic [ref=e26]:
        - text: Over %
        - text: Fair value
    - table [ref=e31]:
      - row "Charting by TradingView" [ref=e32]:
        - cell [ref=e33]
        - cell "Charting by TradingView" [ref=e37]:
          - link "Charting by TradingView" [ref=e41] [cursor=pointer]:
            - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/play/N5A8
            - img [ref=e42]
        - cell [ref=e46]
  - generic [ref=e50]:
    - generic [ref=e51]:
      - button "Set wager to $10" [ref=e52] [cursor=pointer]: $10
      - button "Set wager to $25" [ref=e53] [cursor=pointer]: $25
      - button "Set wager to $50" [ref=e54] [cursor=pointer]: $50
      - button "Set wager to $100" [ref=e55] [cursor=pointer]: $100
      - spinbutton "Custom wager" [ref=e56]: "25"
    - generic [ref=e57]:
      - button "Bet $25 on OVER" [ref=e58] [cursor=pointer]:
        - img [ref=e59]
        - text: OVER
      - button "Bet $25 on UNDER" [ref=e62] [cursor=pointer]:
        - img [ref=e63]
        - text: UNDER
```
