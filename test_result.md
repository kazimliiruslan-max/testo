#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## user_problem_statement:
User reported bugs on customer home page + login flow: "after I log out from restaurants page, when I want to log in again it shows this email already used, but how can I use it?" Also requested completing WIP: hidden delivery fee %, 3-day campaign toggle, and minimum order value.

## backend:
  - task: "Add min_order_value to Restaurant model + enforce on order create + validation for delivery_radius_km"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Added min_order_value field (ge=0) to Restaurant/RestaurantCreate/RestaurantUpdate. Added Field(gt=0) validation to delivery_radius_km. Enforced min_order_value in POST /orders and POST /orders/guest with a friendly HTTP 400 message. Added /admin/cleanup-junk-restaurants endpoint (executed, removed 5 junk rows)."
  - task: "Menu item hidden delivery fee (base price + delivery_fee_pct = display_price)"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "GET /restaurants/{id}/menu returns display_price = base * (1 + fee_pct/100). During active campaign, display_price = base (fee absorbed = discount effect)."
  - task: "3-day campaign start/stop endpoints"
    implemented: true
    working: "NA"
    file: "/app/backend/server.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "POST /restaurants/me/campaign/start sets campaign_active=true, campaign_ends_at=now+3d. /stop clears it. Auto-deactivates expired campaigns on list."

## frontend:
  - task: "Customer home no longer crashes on cuisine chips; adds Sign In CTA for guests"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(customer)/home.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Fixed CUISINES array (was strings, now {label,emoji} objects matching JSX access). Added Sign In button in header when user==null (routes to /(auth)/login). Extended Restaurant TS interface with logo_url/campaign_active/order_count/min_order_value. Popular + Deals + Featured rails now render."
  - task: "Restaurant detail shows display_price (hidden delivery fee applied) + shows min_order pill"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(customer)/restaurant/[id].tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Menu items now render item.display_price (falls back to item.price). Cart uses display_price. When campaign active, base price appears struck-through beside discounted price. Shows 'Min order: ₺X' pill under description when set."
  - task: "Cart enforces min_order_value client-side with clear message"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(customer)/cart.tsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Fetches restaurant on mount, blocks place-order button if total<min_order_value, and displays 'Add ₺X more' banner in footer."
  - task: "Owner settings modal includes minimum order value input"
    implemented: true
    working: "NA"
    file: "/app/frontend/app/(customer)/profile.tsx"
    stuck_count: 0
    priority: "medium"
    needs_retesting: true
    status_history:
        - working: "NA"
          agent: "main"
          comment: "Modal now has minOrderInput (decimal-pad) alongside radius input. Saves via PUT /restaurants/me."

## metadata:
  created_by: "main_agent"
  version: "1.1"
  test_sequence: 9

## test_plan:
  current_focus:
    - "Home page renders + Sign In flow works (guest → login → owner dashboard)"
    - "Owner can set min_order_value and delivery_fee_pct on a menu item"
    - "Customer sees display_price (with hidden fee) on restaurant detail"
    - "Cart blocks checkout if total < min_order_value"
    - "3-day campaign toggle shows Deals rail + strike-through prices"
  stuck_tasks: []
  test_all: false
  test_priority: "high_first"

## agent_communication:
    - agent: "main"
      message: |
        This iteration fixes user-reported issues:
        1) HOME CRASH: CUISINES array was strings but code accessed .label/.emoji — fixed to object array.
        2) LOGIN FLOW: Added a visible Sign In pill on customer home header when guest, so users can log back in easily after logout without ending up on the register screen with 'email already registered'.
        3) HIDDEN DELIVERY FEE: Backend already computed display_price; frontend was still showing item.price. Restaurant detail + cart now use display_price everywhere.
        4) MIN ORDER VALUE: Added min_order_value on Restaurant, enforced on both POST /orders and POST /orders/guest, exposed in owner settings modal, and blocked on client-side cart with a clear delta message.
        5) DELIVERY RADIUS: Now has Field(gt=0) validation.
        6) Cleaned 5 junk test restaurants via /admin/cleanup-junk-restaurants (already executed).
        
        Please run BOTH backend + frontend tests. Credentials in /app/memory/test_credentials.md:
        - Owner1 (Bella Napoli): owner1@directdine.com / password123
        - Customer: customer1@directdine.com / password123
        Backend flows to verify: 
          - PUT /restaurants/me with min_order_value + delivery_radius_km (invalid 0 must 422)
          - POST /orders under min → 400 with 'Minimum order value' text
          - Campaign start/stop endpoints toggle display_price
        Frontend flows to verify: 
          - Guest lands on home, taps Sign In → login screen (no register loop)
          - Owner login → profile → Restaurant Settings → sets min order 200, saves → customer with <200 in cart sees warning banner
          - Restaurant detail menu shows display_price
