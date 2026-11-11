"""
The validation page (biodb-frontend/src/pages/ValidationPage.jsx) backs each
claim with named tests and links to them. A renamed or deleted test would
leave a claim pointing at nothing while still looking verified — so every
test it names must exist, in the file it says.
"""

import ast
import glob
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = os.path.join(HERE, "..", "biodb-frontend", "src", "pages", "ValidationPage.jsx")


def _defined_tests():
    found = {}
    for path in glob.glob(os.path.join(HERE, "test_*.py")):
        tree = ast.parse(open(path).read())
        for node in ast.walk(tree):
            if isinstance(node, ast.FunctionDef) and node.name.startswith("test_"):
                found.setdefault(node.name, set()).add(os.path.basename(path))
    return found


def _claims():
    """(file, test name) for every test the page names, honouring per-check file overrides."""
    source = open(PAGE).read()
    pairs = []
    group_file = None
    # Walk the source in order: a group's `file:` applies to its checks unless
    # a check sets its own; `tests: [...]` lists the names.
    token = re.compile(r"(?P<indent>^[ ]*)file: '(?P<file>[^']+)'|tests: \[(?P<tests>[^\]]*)\]", re.M)
    check_file = None
    for m in token.finditer(source):
        if m.group("file"):
            if len(m.group("indent")) <= 4:  # a group's file
                group_file, check_file = m.group("file"), None
            else:
                check_file = m.group("file")
        else:
            for name in re.findall(r"'(test_\w+)'", m.group("tests")):
                pairs.append((check_file or group_file, name))
            check_file = None
    return pairs


def test_every_test_the_validation_page_names_exists_where_it_says():
    defined = _defined_tests()
    claims = _claims()
    assert len(claims) > 40, "parsed too few claims; has the page's format changed?"
    missing = [f"{file}::{name}" for file, name in claims if file not in defined.get(name, set())]
    assert not missing, f"named on the validation page but not found: {missing}"
