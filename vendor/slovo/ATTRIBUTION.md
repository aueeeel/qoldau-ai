# Slovo

Authors: Alexander Kapitanov, Karina Kvanchiani, Alexander Nagaev, Elizaveta Petrova.

Source: https://github.com/hukenovs/slovo

Model: https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/slovo/models/mvit/onnx/mvit32-2.onnx

Class index: https://github.com/hukenovs/slovo/blob/main/constants.py

Demo video (copied unchanged to examples/salem.mp4): https://github.com/hukenovs/slovo/blob/main/examples/f17a6060-6ced-4bd1-9886-8578cfbb864f.mp4

License: upstream variant of CC BY-SA 4.0; the complete original license is preserved in LICENSE.pdf. Model and demo video are unmodified. Qoldau adds a local inference service and 50 Kazakh text mappings; these mappings are not a validated Kazakhstan sign-language model.

Paper: Kapitanov et al., Slovo: Russian Sign Language Dataset, ICVS 2023, pp. 63–73.

50 unchanged test videos in examples/words are copied from the official Slovo archive. Original attachment IDs and labels are preserved in examples/words/manifest.json. They illustrate RSL signs, with Kazakh text labels; they were not used to fine-tune the legacy ONNX model. In the current landmark recognizer they are included in the runtime reference library; evaluation explicitly excludes the query and all clips by its signer. The same original LICENSE.pdf applies.

## Landmark reference library (September 2026)

1024 source clips were selected from the official Slovo archive: 1000 clips across 50 words and 24 negative examples. Source: https://rndml-team-cv.obs.ru-moscow-1.hc.sbercloud.ru/datasets/slovo/slovo.zip . Original clip IDs, labels, signers and train/test membership are preserved in gesture-data/manifest.json.

Qoldau modifications: MediaPipe hand and pose landmark extraction, body and palm normalization, interpolation to 40 frames, motion features, and Kazakh text mappings. gesture-data/references.json contains derived landmark references, not an independently collected sign-language corpus. The source license in LICENSE.pdf applies to this Slovo-derived data. Raw clips are unchanged; 983 usable positive clips form the runtime references. Negative clips are used only for evaluation/calibration.

Browser playback copies: examples/words/*.webm are VP8 WebM transcodes of the corresponding unchanged Slovo MP4 clips, resized to fit 960×720 with aspect ratio preserved and audio omitted. Original clip IDs and labels remain in examples/words/manifest.json. The same source license applies.
