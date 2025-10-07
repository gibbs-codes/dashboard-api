#!/bin/bash

# =============================================================================
# Dashboard API Test Script
# =============================================================================
# Tests all REST endpoints and validates response formats
#
# Usage: ./test.sh
#
# Requirements:
# - Server must be running on port 3001
# - curl and jq must be installed
# =============================================================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3001"
PASSED=0
FAILED=0
TOTAL=0

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}Warning: jq is not installed. Response validation will be limited.${NC}"
    echo "Install jq: brew install jq (macOS) or apt-get install jq (Linux)"
    JQ_AVAILABLE=false
else
    JQ_AVAILABLE=true
fi

# Helper function to print test result
print_result() {
    local test_name=$1
    local status=$2
    local message=$3

    TOTAL=$((TOTAL + 1))

    if [ "$status" = "PASS" ]; then
        echo -e "${GREEN}✓ PASS${NC} - $test_name"
        PASSED=$((PASSED + 1))
    else
        echo -e "${RED}✗ FAIL${NC} - $test_name"
        if [ -n "$message" ]; then
            echo -e "  ${RED}→${NC} $message"
        fi
        FAILED=$((FAILED + 1))
    fi
}

# Helper function to test endpoint
test_endpoint() {
    local name=$1
    local method=$2
    local endpoint=$3
    local data=$4
    local expected_field=$5

    if [ "$method" = "POST" ]; then
        response=$(curl -s -w "\n%{http_code}" -X POST \
            -H "Content-Type: application/json" \
            -d "$data" \
            "$API_URL$endpoint" 2>/dev/null)
    else
        response=$(curl -s -w "\n%{http_code}" "$API_URL$endpoint" 2>/dev/null)
    fi

    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | head -n-1)

    # Check HTTP status
    if [ "$http_code" != "200" ]; then
        print_result "$name" "FAIL" "HTTP $http_code (expected 200)"
        return
    fi

    # Check if response is valid JSON
    if [ "$JQ_AVAILABLE" = true ]; then
        if ! echo "$body" | jq . >/dev/null 2>&1; then
            print_result "$name" "FAIL" "Invalid JSON response"
            return
        fi

        # Check for expected field if provided
        if [ -n "$expected_field" ]; then
            if ! echo "$body" | jq -e "$expected_field" >/dev/null 2>&1; then
                print_result "$name" "FAIL" "Missing expected field: $expected_field"
                return
            fi
        fi

        # Check for success field
        success=$(echo "$body" | jq -r '.success' 2>/dev/null)
        if [ "$success" = "false" ]; then
            error=$(echo "$body" | jq -r '.error' 2>/dev/null)
            print_result "$name" "FAIL" "API returned success=false: $error"
            return
        fi
    fi

    print_result "$name" "PASS"
}

# =============================================================================
# Start Tests
# =============================================================================

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║           Dashboard API Test Suite                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if server is running
echo -e "${YELLOW}→ Checking if server is running on port 3001...${NC}"
if ! curl -s "$API_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Server is not running on port 3001${NC}"
    echo "Please start the server with: npm run dev"
    exit 1
fi
echo -e "${GREEN}✓ Server is running${NC}"
echo ""

# =============================================================================
# Health & Status Tests
# =============================================================================
echo -e "${BLUE}━━━ Health & Status Endpoints ━━━${NC}"

test_endpoint "GET /health" "GET" "/health" "" ".status"
test_endpoint "GET /status" "GET" "/status" "" ".data.server"

echo ""

# =============================================================================
# Dashboard Tests
# =============================================================================
echo -e "${BLUE}━━━ Dashboard Endpoints ━━━${NC}"

test_endpoint "GET /api/dashboard" "GET" "/api/dashboard" "" ".data.mode"
test_endpoint "GET /api/dashboard/data" "GET" "/api/dashboard/data" "" ".data.mode"
test_endpoint "GET /api/dashboard/data?mode=guest" "GET" "/api/dashboard/data?mode=guest" "" ".data.mode"
test_endpoint "GET /api/dashboard/refresh" "GET" "/api/dashboard/refresh" "" ".data.mode"
test_endpoint "GET /api/dashboard/mode" "GET" "/api/dashboard/mode" "" ".data.mode"
test_endpoint "GET /api/dashboard/modes" "GET" "/api/dashboard/modes" "" ".data.modes"
test_endpoint "POST /api/dashboard/mode" "POST" "/api/dashboard/mode" '{"mode":"guest"}' ".data.mode"

echo ""

# =============================================================================
# Profile Tests
# =============================================================================
echo -e "${BLUE}━━━ Profile Endpoints ━━━${NC}"

test_endpoint "GET /api/profile" "GET" "/api/profile" "" ".data.mode"
test_endpoint "POST /api/profile" "POST" "/api/profile" '{"mode":"personal"}' ".data.mode"
test_endpoint "GET /api/profile/history" "GET" "/api/profile/history" "" ".data.history"
test_endpoint "POST /api/profile/reset" "POST" "/api/profile/reset" "" ".data.mode"

echo ""

# =============================================================================
# Transit Tests
# =============================================================================
echo -e "${BLUE}━━━ Transit Endpoints ━━━${NC}"

test_endpoint "GET /api/transit/all" "GET" "/api/transit/all" "" ".data.buses"
test_endpoint "GET /api/transit/buses" "GET" "/api/transit/buses" "" ".data.buses"
test_endpoint "GET /api/transit/trains" "GET" "/api/transit/trains" "" ".data.red"

echo ""

# =============================================================================
# Weather Tests
# =============================================================================
echo -e "${BLUE}━━━ Weather Endpoints ━━━${NC}"

test_endpoint "GET /api/weather" "GET" "/api/weather" "" ".data.temp"
test_endpoint "GET /api/weather/current" "GET" "/api/weather/current" "" ".data.temp"
test_endpoint "GET /api/weather/forecast" "GET" "/api/weather/forecast" "" ".data.forecast"

echo ""

# =============================================================================
# Calendar Tests
# =============================================================================
echo -e "${BLUE}━━━ Calendar Endpoints ━━━${NC}"

test_endpoint "GET /api/calendar" "GET" "/api/calendar" "" ".data.events"
test_endpoint "GET /api/calendar/today" "GET" "/api/calendar/today" "" ".data.events"
test_endpoint "GET /api/calendar/next" "GET" "/api/calendar/next" "" ".data"

echo ""

# =============================================================================
# Tasks Tests
# =============================================================================
echo -e "${BLUE}━━━ Tasks Endpoints ━━━${NC}"

test_endpoint "GET /api/tasks" "GET" "/api/tasks" "" ".data.tasks"
test_endpoint "GET /api/tasks/all" "GET" "/api/tasks/all" "" ".data.tasks"
test_endpoint "GET /api/tasks/urgent" "GET" "/api/tasks/urgent" "" ".data.tasks"

echo ""

# =============================================================================
# Validation Tests (should fail gracefully)
# =============================================================================
echo -e "${BLUE}━━━ Validation Tests (Expected Failures) ━━━${NC}"

# Test invalid mode
response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{"mode":"invalid"}' \
    "$API_URL/api/dashboard/mode" 2>/dev/null)
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "400" ]; then
    print_result "POST /api/dashboard/mode with invalid mode" "PASS"
else
    print_result "POST /api/dashboard/mode with invalid mode" "FAIL" "Expected 400, got $http_code"
fi

# Test missing mode
response=$(curl -s -w "\n%{http_code}" -X POST \
    -H "Content-Type: application/json" \
    -d '{}' \
    "$API_URL/api/profile" 2>/dev/null)
http_code=$(echo "$response" | tail -n1)
if [ "$http_code" = "400" ]; then
    print_result "POST /api/profile with missing mode" "PASS"
else
    print_result "POST /api/profile with missing mode" "FAIL" "Expected 400, got $http_code"
fi

echo ""

# =============================================================================
# WebSocket Test
# =============================================================================
echo -e "${BLUE}━━━ WebSocket Connection Test ━━━${NC}"

# Check if websocat is installed
if command -v websocat &> /dev/null; then
    # Test WebSocket connection
    ws_response=$(timeout 3 websocat -n1 "ws://localhost:3001" 2>&1)
    if [ $? -eq 0 ] && echo "$ws_response" | grep -q "connection"; then
        print_result "WebSocket connection" "PASS"
    else
        print_result "WebSocket connection" "FAIL" "Could not establish WebSocket connection"
    fi
else
    echo -e "${YELLOW}⚠ Skipped - websocat not installed${NC}"
    echo "  Install: brew install websocat (macOS) or cargo install websocat"
fi

echo ""

# =============================================================================
# Summary
# =============================================================================
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                    Test Summary                            ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Total Tests:  $TOTAL"
echo -e "  ${GREEN}Passed:       $PASSED${NC}"
echo -e "  ${RED}Failed:       $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✓ All tests passed!${NC}"
    exit 0
else
    echo -e "${RED}✗ Some tests failed${NC}"
    exit 1
fi
