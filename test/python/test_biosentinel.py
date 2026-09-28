import hashlib
import json
import tempfile
import unittest
from collections import Counter
from pathlib import Path
import numpy as np
import photometabolic_biosentinel_v3_unified as core


class BiosentinelTests(unittest.TestCase):
    def engine(self, seed=123, dose=.25):
        return core.PhotometabolicBiosentinel(core.FibonacciEngine(seed=seed),
            core.IsodoseMapper(J0=dose, ratio=2.2), core.KuramotoField(N=16, seed=seed))

    def test_isodose_units_and_time(self):
        e=self.engine()
        e.run(4, False)
        for row in e.log:
            self.assertAlmostEqual(row['intensity']*row['duration_ms']/1e6,.25)
        self.assertAlmostEqual(e.field.t, sum(r['duration_ms']/1000 for r in e.log))
        self.assertTrue(all(0<=r['R_mean']<=1 for r in e.log))

    def test_fibonacci_lengths(self):
        for start in 'LS':
            f=core.FibonacciEngine(start=start)
            for depth in range(10):
                self.assertEqual(f.length(depth),len(f.generate(depth)))

    def test_deterministic_model_and_surrogates(self):
        a,b=self.engine(),self.engine()
        a.run(5,False);b.run(5,False)
        self.assertEqual(a.log,b.log)
        symbols=a.fib.generate(6)
        for i in range(10):
            surrogate=core.aaft_surrogate(symbols,core.PortableRandom(i))
            self.assertEqual(Counter(symbols),Counter(surrogate))
        a=core.run_falsification(depth=4,n_surrogates=3,seed=123)
        b=core.run_falsification(depth=4,n_surrogates=3,seed=123)
        self.assertEqual(a,b)
        self.assertGreaterEqual(a['p_value'],.25)
        tied=core.run_falsification(4,3,7309112606740490464,model_config={'n':16,'k':.72})
        self.assertIsNone(tied['gap_sigma'])
        self.assertEqual(tied['p_value'],1)
        self.assertEqual(core.run_falsification(n_surrogates=1)['config']['depth'],9)

    def test_invalid_inputs(self):
        for dose in [0,-1,np.nan,np.inf]:
            with self.assertRaises(ValueError):core.IsodoseMapper(J0=dose)
        for n in [0,1,257]:
            with self.assertRaises(ValueError):core.KuramotoField(N=n)
        for count in [0,-1,200]:
            with self.assertRaises(ValueError):core.run_falsification(n_surrogates=count)
        self.assertEqual(core.mutual_information('',''),0)

    def test_fixture_and_seed_vectors(self):
        for v in json.loads(Path('examples/resonarium/seed-vectors.json').read_text()):
            self.assertEqual(str(core.derive_seed(v['text'])),v['seed'])
            self.assertEqual(core.derive_seed(v['text']),int.from_bytes(hashlib.blake2b(v['text'].encode(),digest_size=8).digest(),'big'))
        fixture=json.loads(Path('examples/resonarium/experiment.json').read_text())
        c=fixture['config'];seed=int(fixture['seed'])
        e=core.PhotometabolicBiosentinel(core.FibonacciEngine(seed=seed),
            core.IsodoseMapper(J0=c['J0'],ratio=c['ratio'],intensity_mw=c['intensity_mw']),
            core.KuramotoField(N=c['N'],seed=seed,kappa=c['kappa'],n_entropy=c['n'],k_lock=c['k']))
        e.run(c['depth'],False)
        for actual,expected in zip(e.log,fixture['trajectory']):
            for key in ['R_mean','psi','t']:self.assertAlmostEqual(actual[key],expected[key],places=10)

    def test_export_modes_and_wav_fallback(self):
        e=self.engine();e.run(5,False)
        with tempfile.TemporaryDirectory() as directory:
            p=Path(directory)
            e.export_resonarium_state(str(p/'nested/state.json'))
            st=json.loads((p/'nested/state.json').read_text())
            self.assertIsInstance(st['natalSeed'],str)
            for m in st['modes']:self.assertLessEqual(abs(m['m']),m['l'])
            saved=core.HAS_SOUNDFILE
            try:
                core.HAS_SOUNDFILE=False
                e.synthesize_audio(.1,str(p/'audio/drone.wav'))
                self.assertEqual((p/'audio/drone.wav').read_bytes()[:4],b'RIFF')
            finally:core.HAS_SOUNDFILE=saved

if __name__ == '__main__':unittest.main()
