# Generated from the authors' notebook ecg_data_preprocessing_mit_bih_intra_patient.ipynb (cell 1, RR-feature version).
# Unchanged except: IN_DIR/OUT_DIR, and the train-split CSVs are not written (counts still printed).

import os
import glob
from collections import Counter
from pathlib import Path

import numpy as np
import wfdb
from scipy import signal
from sklearn.model_selection import train_test_split

# =============================
# CONFIG
# =============================
IN_DIR = os.environ.get("MITBIH_DIR", r"E:/0Project/qcsnn/data/mitdb")
OUT_DIR = str(Path(__file__).resolve().parent / "data/rr_dataset")

ANN_EXT = "atr"
LEAD_PREF = ["MLII", "II"]

LEFT = 90
RIGHT = 89
OUT_LEN = LEFT + 1 + RIGHT  # 180

# Filtering parameters
FS = 360
BANDPASS_LOW = 0.5
BANDPASS_HIGH = 40.0
NOTCH_FREQ = 60.0

# Intra-patient split ratio
TEST_SIZE = 0.2  # 20% test, 80% train
RANDOM_STATE = 42

# 4-class mapping
SYM_TO_FOLDER = {
    "N": "normal", "L": "normal", "R": "normal", "B": "normal",
    "e": "normal", "j": "normal", "n": "normal",
    "A": "sveb", "a": "sveb", "J": "sveb", "S": "sveb",
    "V": "veb", "E": "veb", "r": "veb",
    "F": "f",
}

DROP_BEATS = {"/", "f", "Q", "?"}
CLASS_FOLDERS = ["normal", "sveb", "veb", "f"]

# Use all records (can exclude problematic ones if needed)
EXCLUDED = {102, 104, 107, 217}

RR_EPS = 1e-8
RR_FEAT_NAMES = ["rr_prev_s", "rr_next_s", "rr_ratio", "rr_diff_s"]  # 4 features
N_RR = len(RR_FEAT_NAMES)
OUT_LEN_WITH_RR = OUT_LEN + N_RR  # 180 + 4 = 184

def rr_features_from_ann_samples(ann_samples, i, fs):
    """
    ann_samples: list/np array of beat sample indices in chronological order
    i: index into ann_samples corresponding to current beat
    fs: sampling frequency (Hz)

    Returns: rr_prev_s, rr_next_s, rr_ratio, rr_diff_s
    """
    s_i = int(ann_samples[i])

    # prev
    if i > 0:
        s_prev = int(ann_samples[i - 1])
        rr_prev = (s_i - s_prev) / float(fs)
    else:
        rr_prev = 0.0  # will be overwritten below if possible

    # next
    if i < len(ann_samples) - 1:
        s_next = int(ann_samples[i + 1])
        rr_next = (s_next - s_i) / float(fs)
    else:
        rr_next = 0.0  # will be overwritten below if possible

    # edge fill: if one side missing, copy the other side if available
    if rr_prev <= 0.0 and rr_next > 0.0:
        rr_prev = rr_next
    if rr_next <= 0.0 and rr_prev > 0.0:
        rr_next = rr_prev

    rr_ratio = rr_prev / (rr_next + RR_EPS)
    rr_diff  = rr_prev - rr_next

    return float(rr_prev), float(rr_next), float(rr_ratio), float(rr_diff)



# =============================
# SIGNAL PROCESSING (unchanged)
# =============================
def bandpass_filter(ecg_signal, lowcut=BANDPASS_LOW, highcut=BANDPASS_HIGH, fs=FS, order=4):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = signal.butter(order, [low, high], btype='band')
    return signal.filtfilt(b, a, ecg_signal)

def notch_filter(ecg_signal, freq=NOTCH_FREQ, fs=FS, Q=30):
    b, a = signal.iirnotch(freq, Q, fs)
    return signal.filtfilt(b, a, ecg_signal)

def preprocess_signal(ecg_signal):
    filtered = bandpass_filter(ecg_signal)
    filtered = notch_filter(filtered)
    return filtered.astype(np.float32)

def normalize_beat(beat):
    mean = np.mean(beat)
    std = np.std(beat)
    if std < 1e-8:
        return beat - mean
    return (beat - mean) / std


# =============================
# HELPERS (unchanged)
# =============================
def list_records(in_dir: str):
    hea_files = glob.glob(os.path.join(in_dir, "*.hea"))
    return sorted({os.path.splitext(os.path.basename(p))[0] for p in hea_files})

def pick_lead(record, lead_pref):
    sig_names = [s.upper() for s in record.sig_name]
    idx = None
    for name in lead_pref:
        if name.upper() in sig_names:
            idx = sig_names.index(name.upper())
            break
    if idx is None:
        idx = 0

    if record.p_signal is not None:
        return record.p_signal[:, idx].astype(np.float32), record.sig_name[idx]
    return record.d_signal[:, idx].astype(np.float32), record.sig_name[idx]

def window_centered_lr_edge(signal: np.ndarray, center: int, left: int, right: int) -> np.ndarray:
    n = len(signal)
    idx = np.arange(center - left, center + right + 1)
    idx = np.clip(idx, 0, n - 1)
    return signal[idx].astype(np.float32)

def save_row_csv(row: np.ndarray, out_path: str):
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    np.savetxt(out_path, row.reshape(1, -1), delimiter=",")



# =============================
# GET ALL RECORDS
# =============================
records = list_records(IN_DIR)

all_records = []
for rec in records:
    try:
        rec_num = int(rec)
    except ValueError:
        print(f"Warning: Skipping non-numeric record: {rec}")
        continue
    
    if rec_num in EXCLUDED:
        print(f"Excluding {rec} (extreme imbalance)")
        continue
    
    all_records.append(rec)

print(f"\n=== Processing {len(all_records)} records with intra-patient split ===")

# Make output folders
os.makedirs(OUT_DIR, exist_ok=True)
for split in ["train", "test"]:
    for cls in CLASS_FOLDERS:
        os.makedirs(os.path.join(OUT_DIR, split, cls), exist_ok=True)


# =============================
# PROCESS EACH RECORD WITH INTRA-PATIENT SPLIT
# =============================
def process_record_intra_patient(rec: str):
    rec_path = os.path.join(IN_DIR, rec)

    record = wfdb.rdrecord(rec_path)
    fs = int(getattr(record, "fs", FS))  # use header fs if present, else fallback FS
    sig, lead = pick_lead(record, LEAD_PREF)

    # preprocess using per-record fs (optional but recommended)
    # If you prefer keeping your global FS filter, you can keep preprocess_signal(sig) as-is.
    # Here is the fs-aware version:
    def preprocess_signal_fs(ecg_signal):
        filtered = bandpass_filter(ecg_signal, fs=fs)
        filtered = notch_filter(filtered, fs=fs)
        return filtered.astype(np.float32)

    sig = preprocess_signal_fs(sig)

    ann = wfdb.rdann(rec_path, extension=ANN_EXT)

    ann_samples = ann.sample  # chronological beat locations

    beats_data = []  # list of (row184, class_folder, center_index)

    for i, (samp, sym) in enumerate(zip(ann.sample, ann.symbol)):
        if sym in DROP_BEATS:
            continue

        folder = SYM_TO_FOLDER.get(sym)
        if folder is None:
            continue

        center = int(samp)

        # waveform window
        beat = window_centered_lr_edge(sig, center=center, left=LEFT, right=RIGHT)
        beat = normalize_beat(beat)

        # RR features from annotation timing
        rr_prev_s, rr_next_s, rr_ratio, rr_diff_s = rr_features_from_ann_samples(ann_samples, i, fs)

        # combined row: 180 waveform + 4 rr feats = 184
        row = np.concatenate(
            [beat.astype(np.float32),
             np.array([rr_prev_s, rr_next_s, rr_ratio, rr_diff_s], dtype=np.float32)],
            axis=0
        )

        beats_data.append((row, folder, center))

    if len(beats_data) == 0:
        print(f"[{rec}] No valid beats found")
        return lead, Counter(), Counter()

    rows   = np.array([b[0] for b in beats_data], dtype=np.float32)  # (N, 184)
    labels = np.array([b[1] for b in beats_data])
    centers = np.array([b[2] for b in beats_data])

    class_counts = Counter(labels)
    print(f"[{rec}] lead={lead}, total beats={len(rows)}, classes: " +
          ", ".join(f"{k}={class_counts[k]}" for k in CLASS_FOLDERS if k in class_counts))

    # stratified split
    try:
        indices = np.arange(len(rows))
        train_idx, test_idx = train_test_split(
            indices,
            test_size=TEST_SIZE,
            stratify=labels,
            random_state=RANDOM_STATE
        )
    except ValueError as e:
        print(f"  Warning: Stratification failed for {rec}, using random split: {e}")
        indices = np.arange(len(rows))
        train_idx, test_idx = train_test_split(
            indices,
            test_size=TEST_SIZE,
            random_state=RANDOM_STATE
        )

    train_counts = Counter()
    for idx in train_idx:
        row, folder, center = beats_data[idx]
        out_path = os.path.join(OUT_DIR, "train", folder, f"{rec}_{center}.csv")
        # (walkthrough) train CSVs are not needed: counts only
        train_counts[folder] += 1

    test_counts = Counter()
    for idx in test_idx:
        row, folder, center = beats_data[idx]
        out_path = os.path.join(OUT_DIR, "test", folder, f"{rec}_{center}.csv")
        save_row_csv(row, out_path)
        test_counts[folder] += 1

    print(f"  Train: " + ", ".join(f"{k}={train_counts[k]}" for k in CLASS_FOLDERS if k in train_counts))
    print(f"  Test:  " + ", ".join(f"{k}={test_counts[k]}" for k in CLASS_FOLDERS if k in test_counts))

    return lead, train_counts, test_counts



# =============================
# PROCESS ALL RECORDS
# =============================
global_counts = {"train": Counter(), "test": Counter()}

for rec in sorted(all_records):
    lead, train_c, test_c = process_record_intra_patient(rec)
    
    for k, v in train_c.items():
        global_counts["train"][k] += v
    for k, v in test_c.items():
        global_counts["test"][k] += v

# Save record list
with open(os.path.join(OUT_DIR, "all_records.txt"), "w") as f:
    f.write("\n".join(sorted(all_records)) + "\n")

print("\n=== Final Totals ===")
for split in ["train", "test"]:
    total = sum(global_counts[split].values())
    print(f"{split.upper()}: " + ", ".join(f"{k}={global_counts[split][k]}" for k in CLASS_FOLDERS))
    print(f"  Total: {total}")
    
    normal = global_counts[split].get("normal", 0)
    abnormal = sum(global_counts[split].get(k, 0) for k in ["sveb", "veb", "f"])
    if abnormal > 0:
        ratio = normal / abnormal
        print(f"  Normal:Abnormal ratio = {ratio:.2f}:1")

print(f"\nDone. Intra-patient splits (80/20) saved under: {OUT_DIR}")
