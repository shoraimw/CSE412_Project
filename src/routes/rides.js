import { Router } from "express";
import {
  getOptions,
  createRide,
  getRide,
  updateStatus,
  matchRide,
  shareRide,
  listOpenShared,
  trackRide,
  simulateRide,
} from "../controllers/ridesController.js";

const router = Router();

// Feature 4: Smart Ride Booking
router.get("/options", getOptions);
router.post("/", createRide);

// Feature 5: Smart Ride Match & Cost Sharing (Auto-Match & Proximity Support)
// (Note: Static routes must be declared before dynamic /:id routes)
router.post("/match", matchRide);
router.get("/shared/open", listOpenShared);
router.post("/:id/share", shareRide);

// Feature 6: Real-Time Ride Tracking
router.get("/:id/track", trackRide);
router.post("/:id/simulate", simulateRide);

// Feature 4 (continued)
router.get("/:id", getRide);
router.patch("/:id/status", updateStatus);

export default router;