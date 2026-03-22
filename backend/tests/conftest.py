"""
Pytest configuration and shared fixtures for HevaPOS tests
"""
import pytest
import os

# Set environment variable for tests
os.environ.setdefault('REACT_APP_BACKEND_URL', 'https://heva-ops-test.preview.emergentagent.com')
