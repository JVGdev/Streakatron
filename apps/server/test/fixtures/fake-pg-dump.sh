#!/bin/sh
# Stands in for pg_dump in tests: writes a recognisable "dump", or fails when asked to.
if [ "$FAKE_PG_DUMP_FAIL" = "1" ]; then
  echo "fake pg_dump: connection refused" >&2
  exit 2
fi
echo "fake dump $*"
