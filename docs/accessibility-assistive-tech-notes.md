# FairValue Assistive Technology Notes

Last captured: 2026-08-04

## Scope

This file records a local assistive-technology evidence pass for the rendered FairValue solo-market and room flows.

- Source app: Vite frontend on `http://127.0.0.1:62444`
- Backend: Express/WebSocket server on `http://127.0.0.1:62443`
- Room captured: `9OWU`
- Browser: Playwright Google Chrome for Testing, headed, with `--force-renderer-accessibility`
- Platform evidence: macOS System Events accessibility tree for the Chrome window
- Snapshot evidence: Playwright `ariaSnapshot({ mode: 'ai' })`

The Browser plugin was listed but its required JavaScript browser-control runtime was not exposed in this session, so this pass used the repo Playwright path. No non-disruptive VoiceOver speech-output CLI was available; this pass verifies the macOS accessibility tree that VoiceOver consumes, but it is not a substitute for a human listening to VoiceOver output and using the rotor.

On 2026-08-04, a separate live headed check enabled macOS VoiceOver and drove Chrome against the existing FairValue runtime (`http://127.0.0.1:3018`, backend `8018`). Browse, sort, property detail, join selection, create-room fields, host controls, and the host AI panel were reached through the rendered surface. The AI panel visibly rendered `Evidence used:` and `Limits:` after a fresh local AI response. VoiceOver Utility reported the caption panel setting as enabled, but the app-targeted control path did not expose a reliable rotor transcript or speech-output readback. No human listener was present, so this is live VoiceOver-assisted evidence only; the manual listening/rotor checklist below remains the release gate. VoiceOver was returned to off after the check.

## Result

| Surface | Evidence source | Required accessible names | Result |
|---|---|---|---|
| / browse markets | Playwright ARIA | `FairValue`<br>`Search properties`<br>`Map View`<br>`Sort`<br>`Price: High to Low` | PASS |
| / sort menu open | Playwright ARIA | `Price: High to Low`<br>`Price: Low to High`<br>`Recently Sold`<br>`Largest`<br>`Address A-Z` | PASS |
| /market property detail | Playwright ARIA | `Back to Markets`<br>`3004 26th St`<br>`$800,000`<br>`Market Activity`<br>`Financial Details`<br>`Start a Bid` | PASS |
| /join pick screen | macOS AX + Playwright ARIA | `FairValue`<br>`Create Room`<br>`Join Room` | PASS |
| /join create-room form | macOS AX + Playwright ARIA | `Host nickname`<br>`Property address`<br>`Asking price`<br>`Back`<br>`Create Room` | PASS |
| /host room dashboard | macOS AX + Playwright ARIA | `9OWU`<br>`88 Assistive Tech Way`<br>`AI bot disabled`<br>`Settle`<br>`Connected`<br>`Market Probability` | PASS |
| /host AI degraded live analysis | macOS AX + Playwright ARIA | `AI ANALYST`<br>`Give me a summary of this market`<br>`Local AI analyst`<br>`Evidence used:`<br>`Limits:` | PASS |
| /host settle modal | macOS AX + Playwright ARIA | `Settle Market`<br>`Actual price`<br>`Cancel`<br>`Confirm Settlement` | PASS |
| /play join form | macOS AX + Playwright ARIA | `Join Game`<br>`9OWU`<br>`88 Assistive Tech Way`<br>`Player nickname`<br>`Join Room` | PASS |
| /play betting controls | macOS AX + Playwright ARIA | `Custom wager`<br>`Set wager to $100`<br>`Bet $25 on OVER`<br>`Bet $25 on UNDER` | PASS |
| /host settled result | Playwright ARIA | `Market Settled`<br>`Actual:`<br>`OVER`<br>`WINS`<br>`AX Player` | PASS |
| /play settled result | macOS AX + Playwright ARIA | `Market Settled`<br>`Actual price`<br>`OVER`<br>`wins`<br>`AX Player` | PASS |

## Manual VoiceOver Checklist

Run this checklist with VoiceOver enabled before a public demo or release:

1. On `/`, use VO+Right from the top of the page. Confirm VoiceOver announces FairValue, Search properties, Map View, and the Sort control.
2. Open the Sort menu. Confirm VoiceOver announces each sort option and the active option state.
3. Open `/market/440298192`. Confirm the property address, price, Market Activity, Financial Details, Multiplayer Mode, and Start a Bid are reachable.
4. On `/join`, use VO+Right from the top of the page. Confirm VoiceOver announces the FairValue heading, Create Room, and Join Room in that order.
5. Activate Create Room. Confirm focus lands on Host nickname, then reaches Property address, Asking price, Back, and Create Room in a useful order.
6. Create a room. Confirm the host screen announces room code, player count, connection status, AI toggle state, Settle, property address, probability, leaderboard, activity, QR/public URL controls, and AI analyst controls.
7. Trigger the missing-key AI fallback. Confirm the local room-state answer is announced as a live conversation update with evidence and limits, and does not trap focus.
8. Open Settle. Confirm the dialog is announced as Settle Market, focus starts on Actual price, Escape closes the dialog, and focus returns to Settle.
9. Open `/play/:roomCode` on a narrow viewport. Confirm Join Game, the room code, property address, Player nickname, and Join Room are announced.
10. Join as a player. Confirm the probability meter announces the percentage, wager presets announce dollar amounts, Custom wager is editable, and OVER/UNDER buttons include the current wager in their names.
11. Place a bet and settle the room. Confirm both host and player settled-result regions announce Market Settled, the actual price, the winning outcome, and affected player names.

## Captured Evidence

### / browse markets

macOS AX excerpt:

```text
Not captured for this dense route: The browse route can expose hundreds of map and card nodes to System Events, so this bounded pass asserts the Playwright ARIA snapshot instead.
```

Playwright ARIA snapshot excerpt:

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e10]: FairValue
    - generic [ref=e12]:
      - img [ref=e13]
      - textbox "Search properties" [ref=e16]:
        - /placeholder: Search by address, city, or brokerage...
    - generic [ref=e17]:
      - link "Host or join a room" [ref=e18] [cursor=pointer]:
        - /url: /join
        - img [ref=e19]
        - generic [ref=e24]: Host or join
      - link "Compare 0 properties" [ref=e25] [cursor=pointer]:
        - /url: /compare
        - img [ref=e26]
        - generic [ref=e33]: Compare
      - link "Open prediction profile" [ref=e34] [cursor=pointer]:
        - /url: /me
        - img [ref=e35]
        - text: Profile
      - button "Map View" [pressed] [ref=e38] [cursor=pointer]:
        - img [ref=e39]
        - text: Map View
  - region "Make the call. See the market move." [ref=e41]:
    - generic [ref=e42]:
      - text: Live property intelligence
      - heading "Make the call. See the market move." [level=1] [ref=e43]
      - paragraph [ref=e44]: FairValue turns property evidence into a live, social valuation room. Compare a listing, host an over/under market, and leave a replayable record of the decision.
      - generic [ref=e45]:
        - link "Host a room" [ref=e46] [cursor=pointer]:
          - /url: /join
          - img [ref=e47]
          - text: Host a room
        - link "Join with a code" [ref=e52] [cursor=pointer]:
          - /url: /join
          - img [ref=e53]
          - text: Join with a code
      - status [ref=e60]:
        - strong [ref=e62]: 50 properties ready
        - generic [ref=e63]: · Simulation credits only
    - generic "FairValue workflow" [ref=e64]:
      - generic [ref=e65]:
        - generic [ref=e66]: Room signal
        - generic [ref=e67]: LIVE
      - generic [ref=e69]:
        - strong [ref=e70]: Over / Under
        - generic [ref=e71]: Ask the group before the evidence settles the question.
      - generic [ref=e72]:
        - generic [ref=e73]:
          - strong [ref=e74]: "01"
          - generic [ref=e75]: Choose
        - generic [ref=e76]:
          - strong [ref=e77]: "02"
          - generic [ref=e78]: Trade
        - generic [ref=e79]:
          - strong [ref=e80]: "03"
          - generic [ref=e81]: Replay
  - 'link "2926 25th St #2926 $999,000 2926 25th St #2926 San Francisco, CA 94110 3 bd 2 ba 1,557 sqft Built 1904 View Details Featured" [ref=e83] [cursor=pointer]':
    - /url: /market/457974758
    - 'img "2926 25th St #2926" [ref=e84]'
    - generic [ref=e85]:
      - generic [ref=e86]:
        - generic [ref=e87]: $999,000
        - 'heading "2926 25th St #2926" [level=1] [ref=e88]'
        - generic [ref=e89]:
          - img [ref=e90]
          - text: San Francisco, CA 94110
        - generic [ref=e93]:
          - generic [ref=e94]:
            - img [ref=e95]
            - text: 3 bd
          - generic [ref=e97]:
            - img [ref=e98]
            - text: 2 ba
          - generic [ref=e101]:
            - img [ref=e102]
            - text: 1,557 sqft
          - generic [ref=e107]: Built 1904
```

### / sort menu open

macOS AX excerpt:

```text
Not captured for this dense route: The sort menu sits on the dense browse route; Playwright ARIA provides the bounded menu-role evidence.
```

Playwright ARIA snapshot excerpt:

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e10]: FairValue
    - generic [ref=e12]:
      - img [ref=e13]
      - textbox "Search properties" [ref=e16]:
        - /placeholder: Search by address, city, or brokerage...
    - generic [ref=e17]:
      - link "Host or join a room" [ref=e18] [cursor=pointer]:
        - /url: /join
        - img [ref=e19]
        - generic [ref=e24]: Host or join
      - link "Compare 0 properties" [ref=e25] [cursor=pointer]:
        - /url: /compare
        - img [ref=e26]
        - generic [ref=e33]: Compare
      - link "Open prediction profile" [ref=e34] [cursor=pointer]:
        - /url: /me
        - img [ref=e35]
        - text: Profile
      - button "Map View" [pressed] [ref=e38] [cursor=pointer]:
        - img [ref=e39]
        - text: Map View
  - region "Make the call. See the market move." [ref=e41]:
    - generic [ref=e42]:
      - text: Live property intelligence
      - heading "Make the call. See the market move." [level=1] [ref=e43]
      - paragraph [ref=e44]: FairValue turns property evidence into a live, social valuation room. Compare a listing, host an over/under market, and leave a replayable record of the decision.
      - generic [ref=e45]:
        - link "Host a room" [ref=e46] [cursor=pointer]:
          - /url: /join
          - img [ref=e47]
          - text: Host a room
        - link "Join with a code" [ref=e52] [cursor=pointer]:
          - /url: /join
          - img [ref=e53]
          - text: Join with a code
      - status [ref=e60]:
        - strong [ref=e62]: 50 properties ready
        - generic [ref=e63]: · Simulation credits only
    - generic "FairValue workflow" [ref=e64]:
      - generic [ref=e65]:
        - generic [ref=e66]: Room signal
        - generic [ref=e67]: LIVE
      - generic [ref=e69]:
        - strong [ref=e70]: Over / Under
        - generic [ref=e71]: Ask the group before the evidence settles the question.
      - generic [ref=e72]:
        - generic [ref=e73]:
          - strong [ref=e74]: "01"
          - generic [ref=e75]: Choose
        - generic [ref=e76]:
          - strong [ref=e77]: "02"
          - generic [ref=e78]: Trade
        - generic [ref=e79]:
          - strong [ref=e80]: "03"
          - generic [ref=e81]: Replay
  - 'link "2926 25th St #2926 $999,000 2926 25th St #2926 San Francisco, CA 94110 3 bd 2 ba 1,557 sqft Built 1904 View Details Featured" [ref=e83] [cursor=pointer]':
    - /url: /market/457974758
    - 'img "2926 25th St #2926" [ref=e84]'
    - generic [ref=e85]:
      - generic [ref=e86]:
        - generic [ref=e87]: $999,000
        - 'heading "2926 25th St #2926" [level=1] [ref=e88]'
        - generic [ref=e89]:
          - img [ref=e90]
          - text: San Francisco, CA 94110
        - generic [ref=e93]:
          - generic [ref=e94]:
            - img [ref=e95]
            - text: 3 bd
          - generic [ref=e97]:
            - img [ref=e98]
            - text: 2 ba
          - generic [ref=e101]:
            - img [ref=e102]
            - text: 1,557 sqft
          - generic [ref=e107]: Built 1904
```

### /market property detail

macOS AX excerpt:

```text
Not captured for this dense route: The property detail route includes image, chart, and long detail sections that make full-window System Events traversal unreliable.
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - navigation [ref=e4]:
    - link "Back to Markets" [ref=e5] [cursor=pointer]:
      - /url: /
      - img [ref=e6]
      - generic [ref=e8]: Back to Markets
    - generic [ref=e9]: 3004 26th St
  - generic [ref=e10]:
    - generic [ref=e11]:
      - img "3004 26th St" [ref=e12]
      - generic [ref=e14]: Condo
    - generic [ref=e15]:
      - generic [ref=e16]:
        - generic [ref=e17]: $800,000
        - button "Add to watchlist" [ref=e18] [cursor=pointer]:
          - img [ref=e19]
          - text: Watch
        - button "Add to property comparison" [ref=e21] [cursor=pointer]:
          - img [ref=e22]
          - text: Compare
        - generic [ref=e29]:
          - generic [ref=e30]: Zestimate
          - generic [ref=e31]: $800,400
          - generic [ref=e32]:
            - img [ref=e33]
            - text: +0.1%
      - generic [ref=e36]:
        - generic [ref=e37]:
          - img [ref=e38]
          - generic [ref=e40]:
            - strong [ref=e41]: "3"
            - text: Beds
        - generic [ref=e42]:
          - img [ref=e43]
          - generic [ref=e46]:
            - strong [ref=e47]: "2"
            - text: Baths
        - generic [ref=e48]:
          - img [ref=e49]
          - generic [ref=e54]:
            - strong [ref=e55]: 1,216
            - text: sqft
        - generic [ref=e56]:
          - img [ref=e57]
          - generic [ref=e60]:
            - text: Built
            - strong [ref=e61]: "1930"
        - generic [ref=e62]:
          - img [ref=e63]
          - generic [ref=e66]: Condo
      - generic [ref=e67]:
        - img [ref=e68]
        - generic [ref=e71]: 3004 26th St, San Francisco, CA 94110
      - generic [ref=e72]:
        - img [ref=e73]
        - generic [ref=e76]: Listed by Intero Real Estate Services
    - generic [ref=e77]:
      - generic [ref=e78]:
        - heading "Market Activity" [level=2] [ref=e79]:
          - img [ref=e80]
          - text: Market Activity
        - generic [ref=e83]:
          - text: Over %
          - text: Fair Value
      - table [ref=e86]:
        - row "Charting by TradingView" [ref=e87]:
          - cell [ref=e88]
          - cell "Charting by TradingView" [ref=e92]:
            - link "Charting by TradingView" [ref=e96] [cursor=pointer]:
              - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/market/440298192
              - img [ref=e97]
          - cell [ref=e101]
    - region "Market Trust" [ref=e105]:
      - generic [ref=e106]:
        - heading "Market Trust" [level=2] [ref=e107]:
          - img [ref=e108]
          - text: Market Trust
        - generic [ref=e111]: Simulation market
      - generic [ref=e112]:
        - generic [ref=e113]:
```

### /join pick screen

macOS AX excerpt:

```text
AXHeading: FairValue
AXStaticText: FairValue
AXStaticText: Real Estate Prediction Market
AXButton: Create Room Host a game on TV/projector
AXStaticText: Create Room
AXStaticText: Host a game on TV/projector
AXButton: Market Studio Generate a room from pasted listing text
AXStaticText: Market Studio
AXStaticText: Generate a room from pasted listing text
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
      - button "Market Studio Generate a room from pasted listing text" [ref=e16] [cursor=pointer]:
        - img [ref=e17]
        - generic [ref=e20]: Market Studio
        - generic [ref=e21]: Generate a room from pasted listing text
      - button "Join Room Play from your phone" [ref=e22] [cursor=pointer]:
        - img [ref=e23]
        - generic [ref=e26]: Join Room
        - generic [ref=e27]: Play from your phone
  - button "Browse Markets" [ref=e29] [cursor=pointer]:
    - img [ref=e30]
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
    - generic [ref=e35]:
      - heading "Create a Room" [level=2] [ref=e36]
      - generic [ref=e37]:
        - generic [ref=e38]: Your Nickname
        - textbox "Host nickname" [active] [ref=e39]:
          - /placeholder: Enter your name
      - generic [ref=e40]:
        - generic [ref=e41]: Property Address
        - textbox "Property address" [ref=e42]:
          - /placeholder: 742 Evergreen Terrace
      - generic [ref=e43]:
        - generic [ref=e44]: Asking Price ($)
        - textbox "Asking price" [ref=e45]:
          - /placeholder: 450,000
      - button "Create Room" [ref=e46] [cursor=pointer]
      - button "Back" [ref=e47] [cursor=pointer]
  - button "Browse Markets" [ref=e29] [cursor=pointer]:
    - img [ref=e30]
    - text: Browse Markets
```

### /host room dashboard

macOS AX excerpt:

```text
AXStaticText: 9OWU
AXStaticText: 1
AXStaticText:  player
AXStaticText: Connected
AXCheckBox: Enter projector mode
AXLink: Review
AXStaticText: Review
AXLink: Recap
AXStaticText: Recap
AXCheckBox: AI bot disabled
AXButton: Settle
AXGroup: Host property market summary
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking:
AXStaticText: $
AXStaticText: 720,000
AXStaticText: Over/Under
AXStaticText: 50
AXStaticText: %
AXStaticText: THINK OVER
AXGroup: Host room phase controls
AXStaticText: ROOM PHASE
AXStaticText: Betting open
AXCheckBox: Open betting
AXCheckBox: Start 5 min discussion
AXCheckBox: Lock betting
AXGroup: Live Room Intelligence
AXStaticText: Live Room Intelligence
AXStaticText: Live room intelligence: 50% over, implying $720,000 around the $720,000 ask from LMSR flow, 1 player, 0 trades, and room address and asking price only. No provider-backed comps were queried.
AXStaticText: LOW
AXStaticText:  CONFIDENCE
AXStaticText: LIVE CONSENSUS
AXStaticText: 50% over
AXStaticText: Room leans over asking against the $720,000 ask.
AXStaticText: IMPLIED ROOM VALUE
AXStaticText: $720,000
AXStaticText: LMSR over probability around ask; not an appraisal.
AXStaticText: ROOM LIQUIDITY
AXStaticText: 0 trades
AXStaticText: $0 simulation credits have moved through this room.
AXStaticText: PARTICIPANT BASE
AXStaticText: 1 player
AXStaticText: Thin room: one bet can still swing it.
AXStaticText: DRAFT AUDIT
AXStaticText: Not attached
AXStaticText: No Market Studio draft audit is attached to this room.
AXHeading: Movement read
AXStaticText: Movement read
AXStaticText: No player bets have landed yet; current probability is still close to the LMSR starting point.
AXStaticText: The first few wagers should be treated as early sentiment, not a durable room consensus.
AXHeading: Pressure points
AXStaticText: Pressure points
AXStaticText: Room sentiment is balanced; one strong evidence drop can define the debate.
AXStaticText: Liquidity is thin; frame this as early price discovery.
AXStaticText: No draft audit; state settlement evidence before close.
AXHeading: Host script
AXStaticText: Host script
AXStaticText: Open with the live consensus: 50% over.
AXStaticText: Ask players to name the first evidence artifact before the opening bet.
AXStaticText: Close by restating final sale, appraisal, or signed valuation evidence.
AXStaticText: No Market Studio audit envelope is attached to this room.
AXStaticText: Room intelligence is deterministic local fallback output.
AXStaticText: No provider-backed comps were queried for this panel.
AXGroup: Room trust note
AXStaticText: Room trust note
AXStaticText: Simulation credits only; no real-money trades or investment products.
AXStaticText: Fair value is market-implied, not an appraisal.
AXStaticText: Settlement should use actual sale or appraisal evidence and is preserved in the room event history.
AXGroup: Host market probability chart
AXHeading: Market Probability
AXStaticText: Market Probability
AXGroup: Chart legend
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
AXStaticText: http://127.0.0.1:62444/play/9OWU
AXStaticText: NGROK / PUBLIC URL
AXTextField: Public join URL override
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: 9OWU
      - generic [ref=e7]:
        - img [ref=e8]
        - text: 1 player
      - status [ref=e13]:
        - generic [ref=e15]: Connected
    - generic [ref=e16]:
      - button "Enter projector mode" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - text: Projector
      - link "Review" [ref=e23] [cursor=pointer]:
        - /url: /review/9OWU
        - img [ref=e24]
        - text: Review
      - link "Recap" [ref=e29] [cursor=pointer]:
        - /url: /recap/9OWU
        - img [ref=e30]
        - text: Recap
      - button "AI bot disabled" [ref=e36] [cursor=pointer]:
        - img [ref=e37]
        - text: AI OFF
      - button "Settle" [ref=e40] [cursor=pointer]:
        - img [ref=e41]
        - text: Settle
  - generic [ref=e47]:
    - generic [ref=e48]:
      - region "Host property market summary" [ref=e49]:
        - generic [ref=e50]:
          - generic [ref=e51]: 88 Assistive Tech Way
          - generic [ref=e52]:
            - text: "Asking:"
            - strong [ref=e53]: $720,000
          - generic [ref=e54]: Over/Under
        - generic [ref=e55]:
          - generic [ref=e56]: 50%
          - generic [ref=e57]: think OVER
      - region "Host room phase controls" [ref=e58]:
        - generic [ref=e59]:
          - generic [ref=e60]:
            - img [ref=e61]
            - text: Room phase
          - generic [ref=e64]: Betting open
        - generic [ref=e65]:
          - button "Open betting" [pressed] [ref=e66] [cursor=pointer]:
            - img [ref=e67]
            - generic [ref=e70]: Open betting
          - button "Start 5 min discussion" [ref=e71] [cursor=pointer]:
            - img [ref=e72]
            - generic [ref=e74]: Start 5 min discussion
          - button "Lock betting" [ref=e75] [cursor=pointer]:
            - img [ref=e76]
            - generic [ref=e79]: Lock betting
      - region "Live Room Intelligence" [ref=e80]:
        - generic [ref=e81]:
          - generic [ref=e82]:
            - generic [ref=e83]:
              - img [ref=e84]
              - text: Live Room Intelligence
            - paragraph [ref=e87]: "Live room intelligence: 50% over, implying $720,000 around the $720,000 ask from LMSR flow, 1 player, 0 trades, and room address and asking price only. No provider-backed comps were queried."
          - generic [ref=e88]: low confidence
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]: Live consensus
            - generic [ref=e92]: 50% over
            - generic [ref=e93]: Room leans over asking against the $720,000 ask.
          - generic [ref=e94]:
            - generic [ref=e95]: Implied room value
            - generic [ref=e96]: $720,000
            - generic [ref=e97]: LMSR over probability around ask; not an appraisal.
          - generic [ref=e98]:
            - generic [ref=e99]: Room liquidity
            - generic [ref=e100]: 0 trades
            - generic [ref=e101]: $0 simulation credits have moved through this room.
          - generic [ref=e102]:
            - generic [ref=e103]: Participant base
            - generic [ref=e104]: 1 player
            - generic [ref=e105]: "Thin room: one bet can still swing it."
```

### /host AI degraded live analysis

macOS AX excerpt:

```text
AXStaticText: AI ANALYST
AXGroup: AI analyst conversation
AXStaticText: Give me a summary of this market including the current probability, volume, and fair value assessment.
AXStaticText: Local AI analyst: Cognee is not configured, so this answer is generated from the live room snapshot only.
AXTextField: Ask AI analyst
AXButton: Send AI analyst question
AXStaticText: SCAN TO JOIN
AXStaticText: http://127.0.0.1:62444/play/9OWU
AXStaticText: NGROK / PUBLIC URL
AXTextField: Public join URL override
AXStaticText: LEADERBOARD
AXStaticText: #
AXStaticText: 1
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
      - generic [ref=e6]: 9OWU
      - generic [ref=e7]:
        - img [ref=e8]
        - text: 1 player
      - status [ref=e13]:
        - generic [ref=e15]: Connected
    - generic [ref=e16]:
      - button "Enter projector mode" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - text: Projector
      - link "Review" [ref=e23] [cursor=pointer]:
        - /url: /review/9OWU
        - img [ref=e24]
        - text: Review
      - link "Recap" [ref=e29] [cursor=pointer]:
        - /url: /recap/9OWU
        - img [ref=e30]
        - text: Recap
      - button "AI bot disabled" [ref=e36] [cursor=pointer]:
        - img [ref=e37]
        - text: AI OFF
      - button "Settle" [ref=e40] [cursor=pointer]:
        - img [ref=e41]
        - text: Settle
  - generic [ref=e47]:
    - generic [ref=e48]:
      - region "Host property market summary" [ref=e49]:
        - generic [ref=e50]:
          - generic [ref=e51]: 88 Assistive Tech Way
          - generic [ref=e52]:
            - text: "Asking:"
            - strong [ref=e53]: $720,000
          - generic [ref=e54]: Over/Under
        - generic [ref=e55]:
          - generic [ref=e56]: 50%
          - generic [ref=e57]: think OVER
      - region "Host room phase controls" [ref=e58]:
        - generic [ref=e59]:
          - generic [ref=e60]:
            - img [ref=e61]
            - text: Room phase
          - generic [ref=e64]: Betting open
        - generic [ref=e65]:
          - button "Open betting" [pressed] [ref=e66] [cursor=pointer]:
            - img [ref=e67]
            - generic [ref=e70]: Open betting
          - button "Start 5 min discussion" [ref=e71] [cursor=pointer]:
            - img [ref=e72]
            - generic [ref=e74]: Start 5 min discussion
          - button "Lock betting" [ref=e75] [cursor=pointer]:
            - img [ref=e76]
            - generic [ref=e79]: Lock betting
      - region "Live Room Intelligence" [ref=e80]:
        - generic [ref=e81]:
          - generic [ref=e82]:
            - generic [ref=e83]:
              - img [ref=e84]
              - text: Live Room Intelligence
            - paragraph [ref=e87]: "Live room intelligence: 50% over, implying $720,000 around the $720,000 ask from LMSR flow, 1 player, 0 trades, and room address and asking price only. No provider-backed comps were queried."
          - generic [ref=e88]: low confidence
        - generic [ref=e89]:
          - generic [ref=e90]:
            - generic [ref=e91]: Live consensus
            - generic [ref=e92]: 50% over
            - generic [ref=e93]: Room leans over asking against the $720,000 ask.
          - generic [ref=e94]:
            - generic [ref=e95]: Implied room value
            - generic [ref=e96]: $720,000
            - generic [ref=e97]: LMSR over probability around ask; not an appraisal.
          - generic [ref=e98]:
            - generic [ref=e99]: Room liquidity
            - generic [ref=e100]: 0 trades
            - generic [ref=e101]: $0 simulation credits have moved through this room.
          - generic [ref=e102]:
            - generic [ref=e103]: Participant base
            - generic [ref=e104]: 1 player
            - generic [ref=e105]: "Thin room: one bet can still swing it."
```

### /host settle modal

macOS AX excerpt:

```text
AXGroup: Settle Market
AXHeading: Settle Market
AXStaticText: Settle Market
AXStaticText: Enter the actual appraisal/sale price to determine the winner.
AXGroup: Before settlement
AXStaticText: Before settlement
AXStaticText: Confirm against actual sale or appraisal evidence.
AXStaticText: This value decides simulation-credit payouts only.
AXStaticText: The settlement is written into the room event history.
AXStaticText: ACTUAL PRICE ($)
AXTextField: Actual price
AXStaticText: Asking: $
AXStaticText: 720,000
AXStaticText:  —
AXStaticText:
AXStaticText: enter a price
AXGroup: SETTLEMENT EVIDENCE PACKET
AXStaticText: SETTLEMENT EVIDENCE PACKET
AXStaticText: SUMMARY
AXTextField: SUMMARY
AXStaticText: TYPE
AXStaticText: CONFIDENCE
AXStaticText: LABEL
AXTextField: LABEL
AXStaticText: SOURCE
AXTextField: SOURCE
AXStaticText: REFERENCE
AXTextField: REFERENCE
AXStaticText: OBSERVED AT
AXTextField: OBSERVED AT
AXStaticText: NOTES
AXButton: Cancel
AXButton: Confirm Settlement
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: 9OWU
      - generic [ref=e7]:
        - img [ref=e8]
        - text: 1 player
      - status [ref=e13]:
        - generic [ref=e15]: Connected
    - generic [ref=e16]:
      - button "Enter projector mode" [ref=e17] [cursor=pointer]:
        - img [ref=e18]
        - text: Projector
      - link "Review" [ref=e23] [cursor=pointer]:
        - /url: /review/9OWU
        - img [ref=e24]
        - text: Review
      - link "Recap" [ref=e29] [cursor=pointer]:
        - /url: /recap/9OWU
        - img [ref=e30]
        - text: Recap
      - button "AI bot disabled" [ref=e36] [cursor=pointer]:
        - img [ref=e37]
        - text: AI OFF
      - button "Settle" [ref=e40] [cursor=pointer]:
        - img [ref=e41]
        - text: Settle
  - generic [ref=e47]:
    - generic [ref=e48]:
      - region "Host property market summary" [ref=e49]:
        - generic [ref=e50]:
          - generic [ref=e51]: 88 Assistive Tech Way
          - generic [ref=e52]:
            - text: "Asking:"
            - strong [ref=e53]: $720,000
          - generic [ref=e54]: Over/Under
        - generic [ref=e55]:
          - generic [ref=e56]: 50%
          - generic [ref=e57]: think OVER
      - region "Host room phase controls" [ref=e58]:
        - generic [ref=e59]:
          - generic [ref=e60]:
            - img [ref=e61]
            - text: Room phase
          - generic [ref=e64]: Betting open
        - generic [ref=e65]:
          - button "Open betting" [pressed] [ref=e66] [cursor=pointer]:
            - img [ref=e67]
            - generic [ref=e70]: Open betting
          - button "Start 5 min discussion" [ref=e71] [cursor=pointer]:
            - img [ref=e72]
            - generic [ref=e74]: Start 5 min discussion
          - button "Lock betting" [ref=e75] [cursor=pointer]:
            - img [ref=e76]
            - generic [ref=e79]: Lock betting
      - region "Room trust note" [ref=e142]:
        - generic [ref=e143]:
          - img [ref=e144]
          - generic [ref=e147]: Room trust note
        - list [ref=e148]:
          - listitem [ref=e149]: Simulation credits only; no real-money trades or investment products.
          - listitem [ref=e150]: Fair value is market-implied, not an appraisal.
          - listitem [ref=e151]: Settlement should use actual sale or appraisal evidence and is preserved in the room event history.
      - region "Host market probability chart" [ref=e152]:
        - generic [ref=e153]:
          - heading "Market Probability" [level=2] [ref=e154]
          - generic "Chart legend" [ref=e155]:
            - generic [ref=e156]: OVER probability
            - generic [ref=e158]: Fair value ($)
        - table [ref=e162]:
          - row "Charting by TradingView" [ref=e163]:
            - cell [ref=e164]
            - cell "Charting by TradingView" [ref=e168]:
              - link "Charting by TradingView" [ref=e172] [cursor=pointer]:
                - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/host/9OWU
                - img [ref=e173]
            - cell [ref=e177]
        - generic [ref=e181]:
          - generic [ref=e182]:
            - generic [ref=e183]: Total Trades
```

### /play join form

macOS AX excerpt:

```text
AXStaticText: Join Game
AXStaticText: 9OWU
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking: $
AXStaticText: 720,000
AXGroup: Before you join
AXStaticText: Before you join
AXStaticText: Simulation credits only; no real-money trades or investment products.
AXStaticText: Fair value is market-implied, not an appraisal.
AXStaticText: Settlement should use actual sale or appraisal evidence and is preserved in the room event history.
AXStaticText: YOUR NAME
AXTextField: Player nickname
AXButton: Join Room
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e4]:
  - generic [ref=e5]: Join Game
  - generic [ref=e6]: 9OWU
  - generic [ref=e7]:
    - generic [ref=e8]: 88 Assistive Tech Way
    - generic [ref=e9]: "Asking: $720,000"
  - region "Before you join" [ref=e11]:
    - generic [ref=e12]:
      - img [ref=e13]
      - generic [ref=e16]: Before you join
    - list [ref=e17]:
      - listitem [ref=e18]: Simulation credits only; no real-money trades or investment products.
      - listitem [ref=e19]: Fair value is market-implied, not an appraisal.
      - listitem [ref=e20]: Settlement should use actual sale or appraisal evidence and is preserved in the room event history.
  - generic [ref=e21]:
    - generic [ref=e22]: Your Name
    - textbox "Player nickname" [active] [ref=e23]:
      - /placeholder: Enter your name
  - button "Join Room" [ref=e24] [cursor=pointer]
```

### /play betting controls

macOS AX excerpt:

```text
AXStaticText: 9OWU
AXStaticText: Connected
AXStaticText: 1,000
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking: $
AXStaticText: 720,000
AXGroup: Market mechanics
AXStaticText: Market mechanics
AXStaticText: Your balance and wagers are simulation credits only.
AXStaticText: Over/Under prices come from LMSR probability, not an appraisal.
AXStaticText: The host settles with actual sale or appraisal evidence.
AXGroup: Pre-bet intelligence
AXStaticText: PRE-BET READ
AXStaticText: 50% OVER implies $720,000 around the $720,000 ask.
AXStaticText: Reason to believe:
AXStaticText:
AXStaticText: The room has not moved yet, so your first evidence-backed wager can set the opening signal around $720,000.
AXStaticText: Reason to doubt:
AXStaticText: 0 trades is still thin liquidity; one player can move the room without proving the valuation.
AXStaticText: OVER: ~45.0 shares, 61% OVER after, +11 pts.
AXStaticText: UNDER: ~45.0 shares, 61% UNDER after, +11 pts.
AXStaticText: Local LMSR preview from room probability, wager size, recent room activity, and simulation-credit balance. No external comps were queried.
AXStaticText: 50
AXStaticText: % OVER
AXStaticText: % UNDER
AXStaticText: Market Probability
AXStaticText: Over %
AXStaticText: Fair value
AXGroup: Charting by TradingView
AXLink: Charting by TradingView
AXStaticText: REASON
AXStaticText: 280
AXStaticText: Public, replayed with this bet.
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
      - generic [ref=e6]: 9OWU
      - status [ref=e7]:
        - generic [ref=e9]: Connected
    - generic [ref=e10]:
      - img [ref=e11]
      - generic [ref=e13]: 1,000
  - generic [ref=e14]:
    - generic [ref=e15]: 88 Assistive Tech Way
    - generic [ref=e16]: "Asking: $720,000"
  - region "Market mechanics" [ref=e18]:
    - generic [ref=e19]:
      - img [ref=e20]
      - generic [ref=e23]: Market mechanics
    - list [ref=e24]:
      - listitem [ref=e25]: Your balance and wagers are simulation credits only.
      - listitem [ref=e26]: Over/Under prices come from LMSR probability, not an appraisal.
      - listitem [ref=e27]: The host settles with actual sale or appraisal evidence.
  - region "Pre-bet intelligence" [ref=e28]:
    - generic [ref=e29]:
      - generic [ref=e30]: Pre-bet read
      - generic [ref=e31]: 50% OVER implies $720,000 around the $720,000 ask.
    - generic [ref=e32]:
      - paragraph [ref=e33]:
        - strong [ref=e34]: "Reason to believe:"
        - text: The room has not moved yet, so your first evidence-backed wager can set the opening signal around $720,000.
      - paragraph [ref=e35]:
        - strong [ref=e36]: "Reason to doubt:"
        - text: 0 trades is still thin liquidity; one player can move the room without proving the valuation.
    - generic [ref=e37]:
      - generic [ref=e38]: "OVER: ~45.0 shares, 61% OVER after, +11 pts."
      - generic [ref=e39]: "UNDER: ~45.0 shares, 61% UNDER after, +11 pts."
    - generic [ref=e40]: Local LMSR preview from room probability, wager size, recent room activity, and simulation-credit balance. No external comps were queried.
  - generic [ref=e41]:
    - progressbar "50% probability of going over asking price" [ref=e42]
    - generic [ref=e44]:
      - generic [ref=e45]: 50% OVER
      - generic [ref=e46]: 50% UNDER
  - generic [ref=e47]:
    - generic [ref=e48]:
      - generic [ref=e49]: Market Probability
      - generic [ref=e50]:
        - text: Over %
        - text: Fair value
    - table [ref=e55]:
      - row "Charting by TradingView" [ref=e56]:
        - cell [ref=e57]
        - cell "Charting by TradingView" [ref=e61]:
          - link "Charting by TradingView" [ref=e65] [cursor=pointer]:
            - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/play/9OWU
            - img [ref=e66]
        - cell [ref=e70]
  - generic [ref=e74]:
    - generic [ref=e75]:
      - generic [ref=e76]:
        - generic [ref=e77]: Reason
        - generic [ref=e78]: "280"
      - textbox "Public bet reason" [ref=e79]:
        - /placeholder: Optional thesis for this bet
      - generic [ref=e80]: Public, replayed with this bet.
    - generic [ref=e81]:
      - button "Set wager to $10" [ref=e82] [cursor=pointer]: $10
      - button "Set wager to $25" [ref=e83] [cursor=pointer]: $25
      - button "Set wager to $50" [ref=e84] [cursor=pointer]: $50
      - button "Set wager to $100" [ref=e85] [cursor=pointer]: $100
      - spinbutton "Custom wager" [ref=e86]: "25"
    - generic [ref=e87]:
      - button "Bet $25 on OVER" [ref=e88] [cursor=pointer]:
        - img [ref=e89]
        - text: OVER
      - button "Bet $25 on UNDER" [ref=e92] [cursor=pointer]:
        - img [ref=e93]
        - text: UNDER
```

### /host settled result

macOS AX excerpt:

```text
Not captured for this dense route: macOS System Events traversal timed out for this state; the bounded Playwright ARIA snapshot is the fallback evidence source.
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - generic [ref=e5]:
        - generic [ref=e6]: 9OWU
        - generic [ref=e7]:
          - img [ref=e8]
          - text: 2 players
        - status [ref=e13]:
          - generic [ref=e15]: Connected
      - generic [ref=e16]:
        - button "Enter projector mode" [ref=e17] [cursor=pointer]:
          - img [ref=e18]
          - text: Projector
        - link "Review" [ref=e23] [cursor=pointer]:
          - /url: /review/9OWU
          - img [ref=e24]
          - text: Review
        - link "Recap" [ref=e29] [cursor=pointer]:
          - /url: /recap/9OWU
          - img [ref=e30]
          - text: Recap
    - generic [ref=e47]:
      - generic [ref=e48]:
        - region "Host property market summary" [ref=e49]:
          - generic [ref=e50]:
            - generic [ref=e51]: 88 Assistive Tech Way
            - generic [ref=e52]:
              - text: "Asking:"
              - strong [ref=e53]: $720,000
            - generic [ref=e54]: Over/Under
          - generic [ref=e55]:
            - generic [ref=e56]: 61%
            - generic [ref=e57]: think OVER
        - region "Host room phase controls" [ref=e58]:
          - generic [ref=e59]:
            - generic [ref=e60]:
              - img [ref=e61]
              - text: Room phase
            - generic [ref=e64]: Settled
          - generic [ref=e65]:
            - button "Open betting" [disabled] [ref=e66]:
              - img [ref=e67]
              - generic [ref=e70]: Open betting
            - button "Start 5 min discussion" [disabled] [ref=e71]:
              - img [ref=e72]
              - generic [ref=e74]: Start 5 min discussion
            - button "Lock betting" [disabled] [ref=e75]:
              - img [ref=e76]
              - generic [ref=e79]: Lock betting
        - region "Live Room Intelligence" [ref=e306]:
          - generic [ref=e307]:
            - generic [ref=e308]:
              - generic [ref=e309]:
                - img [ref=e310]
                - text: Live Room Intelligence
              - paragraph [ref=e313]: "Live room intelligence: 61% over, implying $735,926 around the $720,000 ask from LMSR flow, 2 players, 1 trade, and room address and asking price only. No provider-backed comps were queried."
            - generic [ref=e314]: low confidence
          - generic [ref=e315]:
            - generic [ref=e316]:
              - generic [ref=e317]: Live consensus
              - generic [ref=e318]: 61% over
              - generic [ref=e319]: Room leans over asking against the $720,000 ask.
            - generic [ref=e320]:
              - generic [ref=e321]: Implied room value
              - generic [ref=e322]: $735,926
              - generic [ref=e323]: LMSR over probability around ask; not an appraisal.
            - generic [ref=e324]:
              - generic [ref=e325]: Room liquidity
              - generic [ref=e326]: 1 trade
              - generic [ref=e327]: $25 simulation credits have moved through this room.
            - generic [ref=e328]:
              - generic [ref=e329]: Participant base
              - generic [ref=e330]: 2 players
              - generic [ref=e331]: "Broader room: one player has less swing."
            - generic [ref=e332]:
              - generic [ref=e333]: Draft audit
              - generic [ref=e334]: Not attached
              - generic [ref=e335]: No Market Studio draft audit is attached to this room.
          - generic [ref=e336]:
```

### /play settled result

macOS AX excerpt:

```text
AXStaticText: 9OWU
AXStaticText: Connected
AXStaticText: 1,020
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking: $
AXStaticText: 720,000
AXGroup: Market mechanics
AXStaticText: Market mechanics
AXStaticText: Your balance and wagers are simulation credits only.
AXStaticText: Over/Under prices come from LMSR probability, not an appraisal.
AXStaticText: The host settles with actual sale or appraisal evidence.
AXStaticText: Market Settled
AXStaticText: Actual price: $800,000
AXStaticText: OVER
AXStaticText:  wins!
AXStaticText: EVIDENCE PACKET
AXStaticText: 1
AXStaticText:  public item
AXStaticText: Host entered the settlement value without attaching external evidence metadata.
AXGroup: Settlement recap
AXStaticText: Settlement recap
AXStaticText: Payouts are simulation credits only.
AXStaticText: The actual price is host-entered settlement evidence, not a FairValue appraisal.
AXStaticText: Evidence metadata is public-safe and does not include private documents.
AXStaticText: The room event history preserves this outcome for replay.
AXLink: View public recap
AXStaticText: View public recap
AXGroup: Player settlement payouts
AXStaticText: AX Host
AXStaticText: $0
AXStaticText: AX Player
AXStaticText: +$45
AXGroup: Private player reputation
AXStaticText: PRIVATE REPUTATION
AXHeading: My prediction record
AXStaticText: My prediction record
AXButton: Refresh private reputation
AXStaticText: Rooms
AXStaticText: Accuracy
AXStaticText: 100%
AXStaticText: Calibration
AXStaticText: 85/100
AXStaticText: Reasons
AXStaticText: 0
AXStaticText:  bets
AXStaticText: $25
AXStaticText:  wagered
AXStaticText: $45
AXStaticText:  payout
AXGroup: Recent settled rooms
AXStaticText: Binary Over Under
AXStaticText: 1/1 correct
AXStaticText: Simulation-credit rooms only. Private session IDs, user tokens, host tokens, and raw evidence are excluded.
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: 9OWU
      - status [ref=e7]:
        - generic [ref=e9]: Connected
    - generic [ref=e10]:
      - img [ref=e11]
      - generic [ref=e13]: 1,020
  - generic [ref=e14]:
    - generic [ref=e15]: 88 Assistive Tech Way
    - generic [ref=e16]: "Asking: $720,000"
  - region "Market mechanics" [ref=e18]:
    - generic [ref=e19]:
      - img [ref=e20]
      - generic [ref=e23]: Market mechanics
    - list [ref=e24]:
      - listitem [ref=e25]: Your balance and wagers are simulation credits only.
      - listitem [ref=e26]: Over/Under prices come from LMSR probability, not an appraisal.
      - listitem [ref=e27]: The host settles with actual sale or appraisal evidence.
  - generic [ref=e96]:
    - img [ref=e97]
    - generic [ref=e103]: Market Settled
    - generic [ref=e104]: "Actual price: $800,000"
    - generic [ref=e105]: OVER wins!
    - generic [ref=e106]:
      - generic [ref=e107]: Evidence packet
      - strong [ref=e108]: 1 public item
      - paragraph [ref=e109]: Host entered the settlement value without attaching external evidence metadata.
    - region "Settlement recap" [ref=e110]:
      - generic [ref=e111]:
        - img [ref=e112]
        - generic [ref=e115]: Settlement recap
      - list [ref=e116]:
        - listitem [ref=e117]: Payouts are simulation credits only.
        - listitem [ref=e118]: The actual price is host-entered settlement evidence, not a FairValue appraisal.
        - listitem [ref=e119]: Evidence metadata is public-safe and does not include private documents.
        - listitem [ref=e120]: The room event history preserves this outcome for replay.
    - link "View public recap" [ref=e121] [cursor=pointer]:
      - /url: /recap/9OWU
      - img [ref=e122]
      - text: View public recap
    - generic "Player settlement payouts" [ref=e128]:
      - generic [ref=e129]:
        - generic [ref=e130]: AX Host
        - generic [ref=e131]: $0
      - generic [ref=e132]:
        - generic [ref=e133]: AX Player
        - generic [ref=e134]: +$45
  - region "Private player reputation" [ref=e135]:
    - generic [ref=e136]:
      - generic [ref=e138]:
        - generic [ref=e139]: Private reputation
        - heading "My prediction record" [level=2] [ref=e140]
      - button "Refresh private reputation" [ref=e141] [cursor=pointer]: Refresh
    - generic [ref=e142]:
      - generic [ref=e143]:
        - generic [ref=e144]: Rooms
        - strong [ref=e145]: "1"
      - generic [ref=e146]:
        - generic [ref=e147]: Accuracy
        - strong [ref=e148]: 100%
      - generic [ref=e149]:
        - generic [ref=e150]: Calibration
        - strong [ref=e151]: 85/100
      - generic [ref=e152]:
        - generic [ref=e153]: Reasons
        - strong [ref=e154]: "0"
    - generic [ref=e155]:
      - generic [ref=e156]: 1 bets
      - generic [ref=e157]: $25 wagered
      - generic [ref=e158]: $45 payout
    - generic "Recent settled rooms" [ref=e159]:
      - generic [ref=e160]:
        - generic [ref=e161]:
          - strong [ref=e162]: 9OWU
          - generic [ref=e163]: binary over under
        - generic [ref=e164]:
          - strong [ref=e165]: 1/1 correct
          - generic [ref=e166]: 85/100
```
