import unittest
import backend as b

class InferenceTests(unittest.TestCase):
    def scores(self,idx,p=.9):
        scores=b.np.full(1001,(1-p)/1000);scores[idx]=p;return scores
    def test_hello_mapping(self):
        self.assertEqual(b.classify_scores(self.scores(476))['kk'],'Сәлем')
    def test_unknown_class_is_not_forced_to_supported_word(self):
        self.assertEqual(b.classify_scores(self.scores(723))['status'],'unsupported')
    def test_background_has_no_word(self):
        self.assertEqual(b.classify_scores(self.scores(1000))['status'],'idle')
    def test_uncertain_prediction_is_rejected(self):
        self.assertEqual(b.classify_scores(self.scores(476,.4))['status'],'uncertain')
    def test_tentative_top1_is_not_a_confirmed_match(self):
        result=b.classify_scores(self.scores(901,.4))
        self.assertEqual(result['status'],'uncertain')
        self.assertEqual(result['candidate']['kk'],'Ана')
        self.assertNotIn('wordId',result)
    def test_weak_and_unsupported_top1_have_no_candidate(self):
        self.assertNotIn('candidate',b.classify_scores(self.scores(901,.2)))
        self.assertNotIn('candidate',b.classify_scores(self.scores(723,.4)))
    def test_ambiguous_scores_are_rejected(self):
        s=b.np.zeros(1001);s[476]=.55;s[900]=.45
        self.assertEqual(b.classify_scores(s)['status'],'uncertain')
        self.assertNotIn('candidate',b.classify_scores(s))
    def test_invalid_model_output_rejected(self):
        with self.assertRaises(ValueError):b.classify_scores([float('nan')]*1001)
    def test_rgb_normalization_and_letterbox(self):
        image=b.np.zeros((100,200,3),dtype=b.np.uint8);image[:,:,2]=255
        prepared=b.prepare_frame(image)
        self.assertEqual(prepared.shape,(3,224,224))
        b.np.testing.assert_allclose(prepared[:,100,100],(b.np.array([255,0,0])-b.MEAN)/b.STD,rtol=1e-6)
        b.np.testing.assert_allclose(prepared[:,0,0],(114-b.MEAN)/b.STD,rtol=1e-6)
    def test_label_provenance(self):
        import json
        labels=json.loads((b.ROOT/'vendor/slovo/classes.json').read_text(encoding='utf-8'))
        self.assertEqual(len(b.SUPPORTED),9)
        for idx,word in b.SUPPORTED.items():self.assertEqual(labels[str(idx)],word['sourceLabel'])

if __name__=='__main__':unittest.main()
