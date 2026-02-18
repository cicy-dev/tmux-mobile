#!/bin/bash
# E2E Test for ttyd-proxy-v1 - with login

CURL_RPC=${CURL_RPC:-curl-rpc}
ELECTRON_MCP_URL=${ELECTRON_MCP_URL:-http://localhost:8101}
export ELECTRON_MCP_URL

WIN_ID=37

echo "=== E2E Test for ttyd-proxy-v1 (with login) ==="

# Test 1: Check page title after reload
echo -e "\n[Test 1] Check page title..."
TITLE=$(~/skills/electron title 37 | grep -v '^---' | head -1)
echo "Page title: $TITLE"

# Test 2: Check login form (should be visible after logout)
echo -e "\n[Test 2] Check login form..."
LOGIN_BTN=$($CURL_RPC exec_js win_id=$WIN_ID code='document.querySelectorAll("button").length' 2>/dev/null | grep -v '^---' | head -1)
echo "Buttons count: $LOGIN_BTN"

# Test 3: Check token input
echo -e "\n[Test 3] Check token input..."
TOKEN_INPUT=$($CURL_RPC exec_js win_id=$WIN_ID code='document.querySelector("input")?.type' 2>/dev/null | grep -v '^---' | head -1)
echo "Input type: $TOKEN_INPUT"

# Test 4: Enter token
echo -e "\n[Test 4] Enter token..."
$CURL_RPC exec_js win_id=$WIN_ID code='document.querySelector("input").value = "6568a729f18c9903038ff71e70aa1685888d9e8f4ca34419b9a5d9cf784ffdf1"' 2>/dev/null > /dev/null
sleep 1

# Test 5: Click login button
echo -e "\n[Test 5] Click login..."
$CURL_RPC exec_js win_id=$WIN_ID code='document.querySelector("button")?.click()' 2>/dev/null > /dev/null
sleep 3

# Test 6: Check if logged in (sidebar visible)
echo -e "\n[Test 6] Check sidebar after login..."
CHATS=$($CURL_RPC exec_js win_id=$WIN_ID code='document.body.innerText' 2>/dev/null | grep -v '^---' | head -1)
if echo "$CHATS" | grep -q "Chats"; then
  echo "✓ Logged in - Chats section visible"
else
  echo "✗ Login may have failed"
fi

# Test 7: Check if panes are loaded
echo -e "\n[Test 7] Check panes..."
PANES=$($CURL_RPC exec_js win_id=$WIN_ID code='document.body.innerText' 2>/dev/null | grep -v '^---' | head -1)
if echo "$PANES" | grep -q "worker"; then
  echo "✓ Panes loaded"
else
  echo "○ No panes (or none created yet)"
fi

# Test 8: Click create button
echo -e "\n[Test 8] Open create dialog..."
$CURL_RPC exec_js win_id=$WIN_ID code='document.querySelector("button[title=\"Create\"]")?.click()' 2>/dev/null > /dev/null
sleep 1

# Test 9: Type in dialog
echo -e "\n[Test 9] Type window name..."
$CURL_RPC exec_js win_id=$WIN_ID code='document.getElementById("create-dialog-input").value = "e2e_test"' 2>/dev/null > /dev/null
sleep 1

# Test 10: Verify input
echo -e "\n[Test 10] Verify input..."
INPUT_VAL=$($CURL_RPC exec_js win_id=$WIN_ID code='document.getElementById("create-dialog-input").value' 2>/dev/null | grep -v '^---' | head -1)
echo "Input value: $INPUT_VAL"

# Test 11: Click cancel
echo -e "\n[Test 11] Close dialog..."
$CURL_RPC exec_js win_id=$WIN_ID code='document.querySelectorAll("button").forEach(b => { if(b.textContent?.trim() === "Cancel") b.click() })' 2>/dev/null > /dev/null

echo -e "\n=== E2E Test Completed ==="
