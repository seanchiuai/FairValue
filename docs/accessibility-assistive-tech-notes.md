# FairValue Assistive Technology Notes

Last captured: 2026-05-11

## Scope

This file records a local assistive-technology evidence pass for the rendered FairValue solo-market and room flows.

- Source app: Vite frontend on `http://127.0.0.1:57887`
- Backend: Express/WebSocket server on `http://127.0.0.1:57886`
- Room captured: `TFKC`
- Browser: Playwright Google Chrome for Testing, headed, with `--force-renderer-accessibility`
- Platform evidence: macOS System Events accessibility tree for the Chrome window
- Snapshot evidence: Playwright `ariaSnapshot({ mode: 'ai' })`

The Browser plugin was listed but its required JavaScript browser-control runtime was not exposed in this session, so this pass used the repo Playwright path. No non-disruptive VoiceOver speech-output CLI was available; this pass verifies the macOS accessibility tree that VoiceOver consumes, but it is not a substitute for a human listening to VoiceOver output and using the rotor.

## Result

| Surface | Evidence source | Required accessible names | Result |
|---|---|---|---|
| / browse markets | Playwright ARIA | `FairValue`<br>`Search properties`<br>`Map View`<br>`Sort`<br>`Price: High to Low` | PASS |
| / sort menu open | Playwright ARIA | `Price: High to Low`<br>`Price: Low to High`<br>`Recently Sold`<br>`Largest`<br>`Address A-Z` | PASS |
| /market property detail | Playwright ARIA | `Back to Markets`<br>`3004 26th St`<br>`$800,000`<br>`Market Activity`<br>`Financial Details`<br>`Start a Bid` | PASS |
| /join pick screen | macOS AX + Playwright ARIA | `FairValue`<br>`Create Room`<br>`Join Room` | PASS |
| /join create-room form | macOS AX + Playwright ARIA | `Host nickname`<br>`Property address`<br>`Asking price`<br>`Back`<br>`Create Room` | PASS |
| /host room dashboard | macOS AX + Playwright ARIA | `TFKC`<br>`88 Assistive Tech Way`<br>`AI bot disabled`<br>`Settle`<br>`Connected`<br>`Market Probability` | PASS |
| /host AI degraded alert | macOS AX + Playwright ARIA | `AI ANALYST`<br>`Give me a summary of this market`<br>`Set COGNEE_API_KEY on the server` | PASS |
| /host settle modal | macOS AX + Playwright ARIA | `Settle Market`<br>`Actual price`<br>`Cancel`<br>`Confirm Settlement` | PASS |
| /play join form | macOS AX + Playwright ARIA | `Join Game`<br>`TFKC`<br>`88 Assistive Tech Way`<br>`Player nickname`<br>`Join Room` | PASS |
| /play betting controls | macOS AX + Playwright ARIA | `Custom wager`<br>`Set wager to $100`<br>`Bet $25 on OVER`<br>`Bet $25 on UNDER` | PASS |
| /host settled result | macOS AX + Playwright ARIA | `Market Settled`<br>`Actual:`<br>`OVER`<br>`WINS`<br>`AX Player` | PASS |
| /play settled result | macOS AX + Playwright ARIA | `Market Settled`<br>`Actual price`<br>`OVER`<br>`wins`<br>`AX Player` | PASS |

## Manual VoiceOver Checklist

Run this checklist with VoiceOver enabled before a public demo or release:

1. On `/`, use VO+Right from the top of the page. Confirm VoiceOver announces FairValue, Search properties, Map View, and the Sort control.
2. Open the Sort menu. Confirm VoiceOver announces each sort option and the active option state.
3. Open `/market/440298192`. Confirm the property address, price, Market Activity, Financial Details, Multiplayer Mode, and Start a Bid are reachable.
4. On `/join`, use VO+Right from the top of the page. Confirm VoiceOver announces the FairValue heading, Create Room, and Join Room in that order.
5. Activate Create Room. Confirm focus lands on Host nickname, then reaches Property address, Asking price, Back, and Create Room in a useful order.
6. Create a room. Confirm the host screen announces room code, player count, connection status, AI toggle state, Settle, property address, probability, leaderboard, activity, QR/public URL controls, and AI analyst controls.
7. Trigger the missing-key AI fallback. Confirm the degraded response is announced as an alert and does not trap focus.
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
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e10]: FairValue
    - generic [ref=e12]:
      - img [ref=e13]
      - textbox "Search properties" [ref=e16]:
        - /placeholder: Search by address, city, or brokerage...
    - button "Map View" [pressed] [ref=e18] [cursor=pointer]:
      - img [ref=e19]
      - text: Map View
  - 'link "2926 25th St #2926 $999,000 2926 25th St #2926 San Francisco, CA 94110 3 bd 2 ba 1,557 sqft Built 1904 View Details Featured" [ref=e22] [cursor=pointer]':
    - /url: /market/457974758
    - 'img "2926 25th St #2926" [ref=e23]'
    - generic [ref=e24]:
      - generic [ref=e25]:
        - generic [ref=e26]: $999,000
        - 'heading "2926 25th St #2926" [level=1] [ref=e27]'
        - generic [ref=e28]:
          - img [ref=e29]
          - text: San Francisco, CA 94110
        - generic [ref=e32]:
          - generic [ref=e33]:
            - img [ref=e34]
            - text: 3 bd
          - generic [ref=e36]:
            - img [ref=e37]
            - text: 2 ba
          - generic [ref=e40]:
            - img [ref=e41]
            - text: 1,557 sqft
          - generic [ref=e46]: Built 1904
      - generic [ref=e47]:
        - generic [ref=e48]: View Details
        - img [ref=e49]
    - generic [ref=e51]: Featured
  - generic [ref=e52]:
    - generic [ref=e53]:
      - generic [ref=e54]:
        - button "All" [ref=e55] [cursor=pointer]
        - button "House" [ref=e56] [cursor=pointer]
        - button "Condo" [ref=e57] [cursor=pointer]
        - button "Multi-Family" [ref=e58] [cursor=pointer]
        - button "Apartment" [ref=e59] [cursor=pointer]
        - button "Lot" [ref=e60] [cursor=pointer]
      - generic [ref=e62]:
        - button "Any Beds" [ref=e63] [cursor=pointer]
        - button "1+ Beds" [ref=e64] [cursor=pointer]
        - button "2+ Beds" [ref=e65] [cursor=pointer]
        - button "3+ Beds" [ref=e66] [cursor=pointer]
        - button "4+ Beds" [ref=e67] [cursor=pointer]
    - generic [ref=e68]:
      - generic [ref=e69]:
        - text: Sort
        - 'button "Sort markets by Price: High to Low" [ref=e70] [cursor=pointer]':
          - text: "Price: High to Low"
          - img [ref=e71]
      - generic [ref=e73]: 50 of 50
  - generic [ref=e74]:
    - generic [ref=e76]:
      - 'link "2926 25th St #2926 House $999,000 3 bd 2 ba 1,557 sqft 2926 25th St #2926 San Francisco, CA 94110 Zestimate: $1,000,900 (+0.2%)" [ref=e77] [cursor=pointer]':
        - /url: /market/457974758
        - generic [ref=e78]:
          - 'img "2926 25th St #2926" [ref=e79]'
          - generic [ref=e81]: House
        - generic [ref=e82]:
          - generic [ref=e83]: $999,000
          - generic [ref=e84]:
            - generic [ref=e85]:
              - img [ref=e86]
              - text: 3 bd
            - generic [ref=e88]:
              - img [ref=e89]
              - text: 2 ba
            - generic [ref=e92]:
              - img [ref=e93]
              - text: 1,557 sqft
          - 'heading "2926 25th St #2926" [level=3] [ref=e98]'
          - generic [ref=e99]:
```

### / sort menu open

macOS AX excerpt:

```text
Not captured for this dense route: The sort menu sits on the dense browse route; Playwright ARIA provides the bounded menu-role evidence.
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - banner [ref=e4]:
    - generic [ref=e6]:
      - img [ref=e7]
      - generic [ref=e10]: FairValue
    - generic [ref=e12]:
      - img [ref=e13]
      - textbox "Search properties" [ref=e16]:
        - /placeholder: Search by address, city, or brokerage...
    - button "Map View" [pressed] [ref=e18] [cursor=pointer]:
      - img [ref=e19]
      - text: Map View
  - 'link "2926 25th St #2926 $999,000 2926 25th St #2926 San Francisco, CA 94110 3 bd 2 ba 1,557 sqft Built 1904 View Details Featured" [ref=e22] [cursor=pointer]':
    - /url: /market/457974758
    - 'img "2926 25th St #2926" [ref=e23]'
    - generic [ref=e24]:
      - generic [ref=e25]:
        - generic [ref=e26]: $999,000
        - 'heading "2926 25th St #2926" [level=1] [ref=e27]'
        - generic [ref=e28]:
          - img [ref=e29]
          - text: San Francisco, CA 94110
        - generic [ref=e32]:
          - generic [ref=e33]:
            - img [ref=e34]
            - text: 3 bd
          - generic [ref=e36]:
            - img [ref=e37]
            - text: 2 ba
          - generic [ref=e40]:
            - img [ref=e41]
            - text: 1,557 sqft
          - generic [ref=e46]: Built 1904
      - generic [ref=e47]:
        - generic [ref=e48]: View Details
        - img [ref=e49]
    - generic [ref=e51]: Featured
  - generic [ref=e52]:
    - generic [ref=e53]:
      - generic [ref=e54]:
        - button "All" [ref=e55] [cursor=pointer]
        - button "House" [ref=e56] [cursor=pointer]
        - button "Condo" [ref=e57] [cursor=pointer]
        - button "Multi-Family" [ref=e58] [cursor=pointer]
        - button "Apartment" [ref=e59] [cursor=pointer]
        - button "Lot" [ref=e60] [cursor=pointer]
      - generic [ref=e62]:
        - button "Any Beds" [ref=e63] [cursor=pointer]
        - button "1+ Beds" [ref=e64] [cursor=pointer]
        - button "2+ Beds" [ref=e65] [cursor=pointer]
        - button "3+ Beds" [ref=e66] [cursor=pointer]
        - button "4+ Beds" [ref=e67] [cursor=pointer]
    - generic [ref=e68]:
      - generic [ref=e69]:
        - text: Sort
        - 'button "Sort markets by Price: High to Low" [expanded] [active] [ref=e70] [cursor=pointer]':
          - text: "Price: High to Low"
          - img [ref=e71]
        - menu [ref=e1666]:
          - 'menuitemradio "Price: High to Low ✓" [checked] [ref=e1667] [cursor=pointer]':
            - text: "Price: High to Low"
            - generic [ref=e1668]: ✓
          - 'menuitemradio "Price: Low to High" [ref=e1669] [cursor=pointer]'
          - menuitemradio "Recently Sold" [ref=e1670] [cursor=pointer]
          - menuitemradio "Largest" [ref=e1671] [cursor=pointer]
          - menuitemradio "Address A-Z" [ref=e1672] [cursor=pointer]
      - generic [ref=e73]: 50 of 50
  - generic [ref=e74]:
    - generic [ref=e76]:
      - 'link "2926 25th St #2926 House $999,000 3 bd 2 ba 1,557 sqft 2926 25th St #2926 San Francisco, CA 94110 Zestimate: $1,000,900 (+0.2%)" [ref=e77] [cursor=pointer]':
        - /url: /market/457974758
        - generic [ref=e78]:
          - 'img "2926 25th St #2926" [ref=e79]'
          - generic [ref=e81]: House
        - generic [ref=e82]:
          - generic [ref=e83]: $999,000
          - generic [ref=e84]:
            - generic [ref=e85]:
              - img [ref=e86]
              - text: 3 bd
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
        - generic [ref=e18]:
          - generic [ref=e19]: Zestimate
          - generic [ref=e20]: $800,400
          - generic [ref=e21]:
            - img [ref=e22]
            - text: +0.1%
      - generic [ref=e25]:
        - generic [ref=e26]:
          - img [ref=e27]
          - generic [ref=e29]:
            - strong [ref=e30]: "3"
            - text: Beds
        - generic [ref=e31]:
          - img [ref=e32]
          - generic [ref=e35]:
            - strong [ref=e36]: "2"
            - text: Baths
        - generic [ref=e37]:
          - img [ref=e38]
          - generic [ref=e43]:
            - strong [ref=e44]: 1,216
            - text: sqft
        - generic [ref=e45]:
          - img [ref=e46]
          - generic [ref=e48]:
            - text: Built
            - strong [ref=e49]: "1930"
        - generic [ref=e50]:
          - img [ref=e51]
          - generic [ref=e54]: Condo
      - generic [ref=e55]:
        - img [ref=e56]
        - generic [ref=e59]: 3004 26th St, San Francisco, CA 94110
      - generic [ref=e60]:
        - img [ref=e61]
        - generic [ref=e65]: Listed by Intero Real Estate Services
    - generic [ref=e66]:
      - generic [ref=e67]:
        - heading "Market Activity" [level=2] [ref=e68]:
          - img [ref=e69]
          - text: Market Activity
        - generic [ref=e72]:
          - text: Over %
          - text: Fair Value
      - table [ref=e75]:
        - row "Charting by TradingView" [ref=e76]:
          - cell [ref=e77]
          - cell "Charting by TradingView" [ref=e81]:
            - link "Charting by TradingView" [ref=e85] [cursor=pointer]:
              - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/market/440298192
              - img [ref=e86]
          - cell [ref=e90]
    - generic [ref=e94]:
      - heading "Financial Details" [level=2] [ref=e95]:
        - img [ref=e96]
        - text: Financial Details
      - generic [ref=e98]:
        - generic [ref=e99]:
          - generic [ref=e100]: Sale Price
          - generic [ref=e101]: $800,000
        - generic [ref=e102]:
          - generic [ref=e103]: Zestimate
          - generic [ref=e104]: $800,400
        - generic [ref=e105]:
          - generic [ref=e106]: Rent Estimate
          - generic [ref=e107]: $6,043/mo
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
AXStaticText: TFKC
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
AXStaticText: http://127.0.0.1:57887/play/TFKC
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
      - generic [ref=e6]: TFKC
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
                - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/host/TFKC
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
        - generic [ref=e105]: http://127.0.0.1:57887/play/TFKC
        - generic [ref=e106]:
          - generic [ref=e107]: Ngrok / Public URL
          - textbox "Public join URL override" [ref=e108]:
            - /placeholder: https://abcd-1234.ngrok-free.app
      - generic [ref=e109]:
```

### /host AI degraded alert

macOS AX excerpt:

```text
AXStaticText: AI ANALYST
AXStaticText: Give me a summary of this market including the current probability, volume, and fair value assessment.
AXStaticText: Set COGNEE_API_KEY on the server to enable Cognee analysis.
AXTextField: Ask AI analyst
AXButton: Send AI analyst question
AXStaticText: SCAN TO JOIN
AXStaticText: http://127.0.0.1:57887/play/TFKC
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
      - generic [ref=e6]: TFKC
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
                - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/host/TFKC
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
        - log [ref=e134]:
          - generic [ref=e136]: Give me a summary of this market including the current probability, volume, and fair value assessment.
          - generic [ref=e137]:
            - img [ref=e138]
            - alert [ref=e141]: Set COGNEE_API_KEY on the server to enable Cognee analysis.
        - generic [ref=e92]:
          - textbox "Ask AI analyst" [ref=e93]:
            - /placeholder: Ask about this market...
          - button "Send AI analyst question" [disabled] [ref=e94] [cursor=pointer]:
            - img [ref=e95]
    - generic [ref=e98]:
      - generic [ref=e99]:
        - generic [ref=e100]: Scan to Join
        - img "Join room QR code" [ref=e102]
        - generic [ref=e105]: http://127.0.0.1:57887/play/TFKC
        - generic [ref=e106]:
          - generic [ref=e107]: Ngrok / Public URL
          - textbox "Public join URL override" [ref=e108]:
            - /placeholder: https://abcd-1234.ngrok-free.app
      - generic [ref=e109]:
        - generic [ref=e110]:
          - img [ref=e111]
          - text: Leaderboard
        - generic [ref=e117]:
          - generic [ref=e118]: "#1"
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
      - generic [ref=e6]: TFKC
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
                - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/host/TFKC
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
        - log [ref=e134]:
          - generic [ref=e136]: Give me a summary of this market including the current probability, volume, and fair value assessment.
          - generic [ref=e137]:
            - img [ref=e138]
            - alert [ref=e141]: Set COGNEE_API_KEY on the server to enable Cognee analysis.
        - generic [ref=e92]:
          - textbox "Ask AI analyst" [ref=e93]:
            - /placeholder: Ask about this market...
          - button "Send AI analyst question" [disabled] [ref=e94] [cursor=pointer]:
            - img [ref=e95]
    - generic [ref=e98]:
      - generic [ref=e99]:
        - generic [ref=e100]: Scan to Join
        - img "Join room QR code" [ref=e102]
        - generic [ref=e105]: http://127.0.0.1:57887/play/TFKC
        - generic [ref=e106]:
          - generic [ref=e107]: Ngrok / Public URL
          - textbox "Public join URL override" [ref=e108]:
            - /placeholder: https://abcd-1234.ngrok-free.app
      - generic [ref=e109]:
        - generic [ref=e110]:
          - img [ref=e111]
          - text: Leaderboard
        - generic [ref=e117]:
          - generic [ref=e118]: "#1"
```

### /play join form

macOS AX excerpt:

```text
AXStaticText: Join Game
AXStaticText: TFKC
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
  - generic [ref=e6]: TFKC
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
AXStaticText: TFKC
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
      - generic [ref=e6]: TFKC
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
            - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/play/TFKC
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

### /host settled result

macOS AX excerpt:

```text
AXStaticText: TFKC
AXStaticText: 2
AXStaticText:  player
AXStaticText: s
AXStaticText: Connected
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking:
AXStaticText: $
AXStaticText: 720,000
AXStaticText: 61
AXStaticText: %
AXStaticText: THINK OVER
AXStaticText: Market Settled
AXStaticText: Actual: $
AXStaticText: 800,000
AXStaticText: OVER
AXStaticText:  WINS
AXStaticText: Market Probability
AXStaticText: OVER probability
AXStaticText: Fair value ($)
AXGroup: Charting by TradingView
AXLink: Charting by TradingView
AXStaticText: TOTAL TRADES
AXStaticText: 1
AXStaticText: VOLUME
AXStaticText: 25
AXStaticText: AVG BET
AXStaticText: AI ANALYST
AXStaticText: Give me a summary of this market including the current probability, volume, and fair value assessment.
AXStaticText: Set COGNEE_API_KEY on the server to enable Cognee analysis.
AXTextField: Ask AI analyst
AXButton: Send AI analyst question
AXStaticText: SCAN TO JOIN
AXStaticText: http://127.0.0.1:57887/play/TFKC
AXStaticText: NGROK / PUBLIC URL
AXTextField: Public join URL override
AXStaticText: LEADERBOARD
AXStaticText: #
AXStaticText: AX Player
AXStaticText: 1020
AXStaticText: AX Host
AXStaticText: 1000
AXStaticText: ACTIVITY
AXStaticText: Market settled —
AXStaticText:  wins
AXStaticText:  bet $
AXStaticText:  on
AXStaticText:
AXStaticText:  joined
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e5]:
    - generic [ref=e6]: TFKC
    - generic [ref=e7]:
      - img [ref=e8]
      - text: 2 players
    - status [ref=e13]:
      - generic [ref=e15]: Connected
  - generic [ref=e28]:
    - generic [ref=e29]:
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]: 88 Assistive Tech Way
          - generic [ref=e34]:
            - text: "Asking:"
            - strong [ref=e35]: $720,000
        - generic [ref=e36]:
          - generic [ref=e37]: 61%
          - generic [ref=e38]: think OVER
      - generic [ref=e153]:
        - img [ref=e154]
        - generic [ref=e160]: Market Settled
        - generic [ref=e161]: "Actual: $800,000"
        - generic [ref=e162]: OVER WINS
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
                - /url: https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart&utm_source=127.0.0.1/host/TFKC
                - img [ref=e58]
            - cell [ref=e62]
        - generic [ref=e66]:
          - generic [ref=e67]:
            - generic [ref=e68]: Total Trades
            - generic [ref=e69]: "1"
          - generic [ref=e70]:
            - generic [ref=e71]: Volume
            - generic [ref=e72]: $25
          - generic [ref=e73]:
            - generic [ref=e74]: Avg Bet
            - generic [ref=e75]: $25
      - generic [ref=e76]:
        - generic [ref=e77]:
          - img [ref=e78]
          - text: AI Analyst
        - log [ref=e134]:
          - generic [ref=e136]: Give me a summary of this market including the current probability, volume, and fair value assessment.
          - generic [ref=e137]:
            - img [ref=e138]
            - alert [ref=e141]: Set COGNEE_API_KEY on the server to enable Cognee analysis.
        - generic [ref=e92]:
          - textbox "Ask AI analyst" [ref=e93]:
            - /placeholder: Ask about this market...
          - button "Send AI analyst question" [disabled] [ref=e94] [cursor=pointer]:
            - img [ref=e95]
    - generic [ref=e98]:
      - generic [ref=e99]:
        - generic [ref=e100]: Scan to Join
        - img "Join room QR code" [ref=e102]
        - generic [ref=e105]: http://127.0.0.1:57887/play/TFKC
        - generic [ref=e106]:
          - generic [ref=e107]: Ngrok / Public URL
          - textbox "Public join URL override" [ref=e108]:
            - /placeholder: https://abcd-1234.ngrok-free.app
      - generic [ref=e109]:
        - generic [ref=e110]:
          - img [ref=e111]
          - text: Leaderboard
        - generic [ref=e163]:
          - generic [ref=e164]: "#1"
          - generic [ref=e165]: AX Player
          - generic [ref=e166]:
            - img [ref=e167]
```

### /play settled result

macOS AX excerpt:

```text
AXStaticText: TFKC
AXStaticText: Connected
AXStaticText: 1,020
AXStaticText: 88 Assistive Tech Way
AXStaticText: Asking: $
AXStaticText: 720,000
AXStaticText: Market Settled
AXStaticText: Actual price: $
AXStaticText: 800,000
AXStaticText: OVER
AXStaticText:  wins!
AXStaticText: AX Host
AXStaticText: $0
AXStaticText: AX Player
AXStaticText: +$45
```

Playwright ARIA snapshot excerpt:

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: TFKC
      - status [ref=e7]:
        - generic [ref=e9]: Connected
    - generic [ref=e10]:
      - img [ref=e11]
      - generic [ref=e13]: 1,020
  - generic [ref=e14]:
    - generic [ref=e15]: 88 Assistive Tech Way
    - generic [ref=e16]: "Asking: $720,000"
  - generic [ref=e66]:
    - img [ref=e67]
    - generic [ref=e73]: Market Settled
    - generic [ref=e74]: "Actual price: $800,000"
    - generic [ref=e75]: OVER wins!
    - generic [ref=e76]:
      - generic [ref=e77]: AX Host
      - generic [ref=e78]: $0
    - generic [ref=e79]:
      - generic [ref=e80]: AX Player
      - generic [ref=e81]: +$45
```
