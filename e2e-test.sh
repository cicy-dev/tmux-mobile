#!/bin/bash
# E2E Test for ttyd-proxy-v1

CURL_RPC=${CURL_RPC:-curl-rpc}

echo "=== E2E Test for ttyd-proxy-v1 ==="

WIN_ID=37

# Logout and reload
echo ""
echo "[Setup] Logout and reload..."
$CURL_RPC exec_js win_id=$WIN_ID code='localStorage.removeItem("token"); location.reload()' 2>/dev/null
sleep 3

# Test 1: Page title
echo ""
echo "[Test 1] Page title"
TITLE=$($CURL_RPC exec_js win_id=$WIN_ID code='document.title' 2>/dev/null | grep -v '^---' | head -1)
echo "Result: $TITLE"

# Test 2: Login
echo ""
echo "[Test 2] Login"
$CURL_RPC exec_js win_id=$WIN_ID code='var i=document.getElementById("login-token-input"); if(i){i.value="6568a729f18c9903038ff71e70aa1685888d9e8f4ca34419b9a5d9cf784ffdf1";var b=document.querySelector("button");if(b)b.click()}' 2>/dev/null
sleep 3
CHATS=$($CURL_RPC exec_js win_id=$WIN_ID code='document.body.innerText' 2>/dev/null | grep -v '^---' | head -1)
if echo "$CHATS" | grep -q "Sessions\|Chats"; then
  echo "Result: PASS"
else
  echo "Result: FAIL"
fi

# Test 3: Open create dialog
echo ""
echo "[Test 3] Open create dialog"
$CURL_RPC exec_js win_id=$WIN_ID code='var btn=document.querySelector("button[title=\"Create\"]");if(btn)btn.click()' 2>/dev/null
sleep 1
DIALOG=$($CURL_RPC exec_js win_id=$WIN_ID code='document.body.innerText' 2>/dev/null | grep -v '^---' | head -1)
if echo "$DIALOG" | grep -q "Create New Window"; then
  echo "Result: PASS"
else
  echo "Result: FAIL"
fi

# Test 4: Type in dialog
echo ""
echo "[Test 4] Type in dialog"
$CURL_RPC exec_js win_id=$WIN_ID code='var inp=document.getElementById("create-dialog-input");if(inp)inp.value="e2e_test"' 2>/dev/null
sleep 1
VAL=$($CURL_RPC exec_js win_id=$WIN_ID code='var inp=document.getElementById("create-dialog-input");if(inp)inp.value' 2>/dev/null | grep -v '^---' | head -1)
echo "Input value: $VAL"

# Test 5: Close dialog
echo ""
echo "[Test 5] Close dialog"
$CURL_RPC exec_js win_id=$WIN_ID code='var btns=document.querySelectorAll("button");btns.forEach(function(b){if(b.textContent && b.textContent.indexOf("Cancel")>=0)b.click()})' 2>/dev/null
sleep 1

echo ""
echo "=== E2E Test Completed ==="
