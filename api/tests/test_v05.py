import asyncio
import unittest

from app.ai_provider import repurpose_content
from app.schemas import RepurposeRequest


class V05Tests(unittest.TestCase):
    def test_repurpose_schema_defaults(self):
        req = RepurposeRequest(topic='北京650分是否出京', title='北京650分到底要不要出京', body='正文')
        self.assertIn('video_script', req.channels)
        self.assertIn('wechat_moments', req.channels)

    def test_repurpose_mock_without_api(self):
        result, mode = asyncio.run(repurpose_content(
            '北京650分是否出京',
            '北京650分到底要不要出京',
            '很多家长会先问留北京是不是一定更好。真正要比较的是学校、专业、城市与未来路径。',
            ['video_script','wechat_moments','wechat_group'],
        ))
        self.assertIn(mode, {'mock','openai'})
        self.assertEqual(len(result.outputs), 3)
        channels = {x.channel for x in result.outputs}
        self.assertEqual(channels, {'video_script','wechat_moments','wechat_group'})
        self.assertTrue(all(x.body for x in result.outputs))


if __name__ == '__main__':
    unittest.main()
