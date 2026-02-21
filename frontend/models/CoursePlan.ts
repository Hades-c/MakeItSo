import mongoose, { Document, Model, Schema } from "mongoose";

export type CourseStatus = "planned" | "in-progress" | "completed" | "dropped";

export interface IPlannedCourse {
  courseId: mongoose.Types.ObjectId;
  courseCode: string;    // denormalized for quick display
  courseName: string;    // denormalized for quick display
  credits: number;       // denormalized for credit calculations
  semester: "Fall" | "Spring" | "Summer";
  year: number;
  status: CourseStatus;
  grade?: string;        // e.g. "A", "B+", "Pass"
  notes?: string;
}

export interface ICoursePlan extends Document {
  userId: mongoose.Types.ObjectId;
  plannedCourses: IPlannedCourse[];
  totalCreditsCompleted: number;
  totalCreditsPlanned: number;
  createdAt: Date;
  updatedAt: Date;
}

const PlannedCourseSchema = new Schema<IPlannedCourse>({
  courseId: { type: Schema.Types.ObjectId, ref: "Course", required: true },
  courseCode: { type: String, required: true },
  courseName: { type: String, required: true },
  credits: { type: Number, required: true },
  semester: { type: String, enum: ["Fall", "Spring", "Summer"], required: true },
  year: { type: Number, required: true },
  status: {
    type: String,
    enum: ["planned", "in-progress", "completed", "dropped"],
    default: "planned",
  },
  grade: { type: String },
  notes: { type: String },
});

const CoursePlanSchema = new Schema<ICoursePlan>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    plannedCourses: [PlannedCourseSchema],
    totalCreditsCompleted: { type: Number, default: 0 },
    totalCreditsPlanned: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Recompute credit totals before saving
CoursePlanSchema.pre("save", function (next) {
  this.totalCreditsCompleted = this.plannedCourses
    .filter((c) => c.status === "completed")
    .reduce((sum, c) => sum + c.credits, 0);

  this.totalCreditsPlanned = this.plannedCourses
    .filter((c) => c.status !== "dropped")
    .reduce((sum, c) => sum + c.credits, 0);

  next();
});

const CoursePlan: Model<ICoursePlan> =
  mongoose.models.CoursePlan ??
  mongoose.model<ICoursePlan>("CoursePlan", CoursePlanSchema);

export default CoursePlan;
