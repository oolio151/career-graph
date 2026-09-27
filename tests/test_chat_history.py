import unittest
from python.chat_history import bounded_history


class HistoryTests(unittest.TestCase):
    def test_keeps_newest_complete_exchanges_within_both_limits(self):
        turns = [{'user': str(i), 'advisor': 'reply'} for i in range(12)]
        self.assertEqual(bounded_history(turns), turns[-8:])
        long = [{'user': 'hello', 'advisor': 'x' * 4000} for _ in range(8)]
        self.assertEqual(len(bounded_history(long)), 2)
        self.assertEqual(bounded_history([None, {'user': 4}, turns[0]]), [turns[0]])
