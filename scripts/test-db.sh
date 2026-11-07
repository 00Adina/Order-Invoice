#!/usr/bin/env bash
# Applies migration + seed to a local Postgres and runs the SQL assertions in tests/db.test.sql.
set -euo pipefail
DB=${DB:-order_app_test}
HERE=$(cd "$(dirname "$0")/.." && pwd)
DB=$DB "$HERE/scripts/setup-test-db.sh"
su postgres -c "psql -q -t -A -v ON_ERROR_STOP=1 -d $DB -f $HERE/tests/db.test.sql" | grep -v "^$"
echo "DB TESTS PASSED"
