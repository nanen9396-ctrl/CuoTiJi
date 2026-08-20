from pathlib import Path

from PIL import Image, ImageOps


root = Path(__file__).resolve().parents[1]
source = Image.open(root / "reference" / "selected-design.png").convert("RGB")
implementation = Image.open(root / "qa" / "home-implementation.png").convert("RGB")

target_size = (393, 852)
normalized_source = ImageOps.fit(source, target_size, method=Image.Resampling.LANCZOS)
normalized_source.save(root / "qa" / "home-source-normalized.png")

gap = 18
comparison = Image.new("RGB", (target_size[0] * 2 + gap, target_size[1]), "#dbe2ee")
comparison.paste(normalized_source, (0, 0))
comparison.paste(implementation, (target_size[0] + gap, 0))
comparison.save(root / "qa" / "home-comparison.png")
