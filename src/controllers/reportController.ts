import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Report, { IssueType, ReportStatus, Priority } from '../models/Report';
import User from '../models/User';
import Truck from '../models/Truck';
import Route, { RouteStatus } from '../models/Route';
import RouteStop, { StopStatus } from '../models/RouteStop';
import { AuthRequest } from '../middleware/auth';
import ReportComment from '../models/ReportComment';
import { ZoneName } from '../constants/portMoresbyZones';

// ============================================
// HELPER: Enrich reports with completion proof
// ✅ Prefers Report.proofPhoto (persisted after stop deletion)
// ✅ Falls back to an existing RouteStop for in-flight stops
// ============================================
const enrichReportsWithCompletionProof = async (reports: any[]) => {
  if (!reports || reports.length === 0) return reports;

  const reportIds = reports.map((r) => r.id);

  // Pull any still-existing complaint RouteStops (haven't been completed yet)
  const stops = await RouteStop.findAll({
    where: {
      reportId: { [Op.in]: reportIds },
      isComplaintStop: true,
    },
    attributes: [
      'id',
      'reportId',
      'beforePhoto',
      'afterPhoto',
      'completedAt',
      'status',
    ],
  });

  const stopProofByReport: Record<
    string,
    {
      beforePhoto: string | null;
      afterPhoto: string | null;
      completedAt: Date | null;
    }
  > = {};

  stops.forEach((stop: any) => {
    const sj = stop.toJSON();
    if (sj.reportId) {
      stopProofByReport[sj.reportId] = {
        beforePhoto: sj.beforePhoto || null,
        afterPhoto: sj.afterPhoto || null,
        completedAt: sj.completedAt || null,
      };
    }
  });

  return reports.map((r) => {
    const reportJson = r.toJSON ? r.toJSON() : r;

    // ✅ Prefer the report's own persisted proof photo
    const hasReportProof = !!reportJson.proofPhoto;
    const stopProof = stopProofByReport[reportJson.id] || null;

    let completionProof:
      | {
          beforePhoto: string | null;
          afterPhoto: string | null;
          completedAt: Date | null;
        }
      | null = null;

    if (hasReportProof) {
      // Report has its own proof — use it, keep beforePhoto from stop if present
      completionProof = {
        beforePhoto: stopProof?.beforePhoto || null,
        afterPhoto: reportJson.proofPhoto,
        completedAt:
          reportJson.proofPhotoUploadedAt || stopProof?.completedAt || null,
      };
    } else if (stopProof) {
      // In-flight stop with photos but report not yet updated
      completionProof = stopProof;
    }

    return {
      ...reportJson,
      completionProof,
    };
  });
};

// ============================================
// CREATE REPORT
// ============================================
export const createReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const {
      issueType,
      description,
      address,
      zone,
      latitude,
      longitude,
      photos,
      contactName,
      contactPhone,
      contactEmail,
    } = req.body;

    if (!issueType || !description || !address) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'issueType, description, and address are required',
      });
    }

    const allowedIssueTypes = Object.values(IssueType);
    if (!allowedIssueTypes.includes(issueType)) {
      return res.status(400).json({
        error: 'Invalid issue type',
        message: `issueType must be one of: ${allowedIssueTypes.join(', ')}`,
      });
    }

    // ✅ Photos required EXCEPT for emergency alerts
    const isEmergencyAlert = description?.startsWith('[🚨 DRIVER EMERGENCY]');

    if (
      !isEmergencyAlert &&
      (!photos || !Array.isArray(photos) || photos.length === 0)
    ) {
      return res.status(400).json({
        error: 'Photos required',
        message:
          'At least one photo is required as evidence of the issue. Please attach a photo and try again.',
      });
    }

    let priority: Priority = Priority.MEDIUM;
    if (issueType === IssueType.ILLEGAL_DUMPING) {
      priority = Priority.HIGH;
    } else if (issueType === IssueType.OVERFLOWING_BIN) {
      priority = Priority.MEDIUM;
    } else if (issueType === IssueType.MISSED_COLLECTION) {
      priority = Priority.MEDIUM;
    }

    const report = await Report.create({
      citizenId: req.user.id,
      issueType,
      description,
      address,
      zone: zone || null,
      latitude: latitude || null,
      longitude: longitude || null,
      photos: photos || [],
      status: ReportStatus.PENDING,
      priority,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      contactEmail: contactEmail || null,
    });

    res.status(201).json({
      message: 'Report submitted successfully',
      report,
    });
  } catch (error: any) {
    console.error('Create report error:', error);
    res.status(500).json({
      error: 'Failed to create report',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET MY REPORTS (Citizen view)
// ✅ Shows ALL reports including archived ones
// ============================================
export const getMyReports = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const reports = await Report.findAll({
      where: { citizenId: req.user.id },
      order: [['createdAt', 'DESC']],
    });

    const reportIds = reports.map((r) => r.id);

    let commentsByReport: Record<string, any[]> = {};

    if (reportIds.length > 0) {
      const comments = await ReportComment.findAll({
        where: {
          reportId: { [Op.in]: reportIds },
          isInternal: false,
        },
        include: [
          {
            model: User,
            as: 'author',
            attributes: ['id', 'name', 'role'],
          },
        ],
        order: [['createdAt', 'ASC']],
      });

      commentsByReport = comments.reduce((acc: any, comment: any) => {
        const c = comment.toJSON();
        if (!acc[c.reportId]) acc[c.reportId] = [];
        acc[c.reportId].push({
          id: c.id,
          content: c.content,
          createdAt: c.createdAt,
          authorName: c.author?.name || 'Admin',
          authorRole: c.author?.role || 'admin',
        });
        return acc;
      }, {});
    }

    const reportsWithComments = reports.map((r) => ({
      ...r.toJSON(),
      adminComments: commentsByReport[r.id] || [],
    }));

    const enriched = await enrichReportsWithCompletionProof(
      reportsWithComments
    );

    res.json({
      count: enriched.length,
      reports: enriched,
    });
  } catch (error: any) {
    console.error('Get my reports error:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET ALL REPORTS (Admin view)
// ✅ Hides archived reports from the Admin Complaint tab
// ============================================
export const getAllReports = async (req: AuthRequest, res: Response) => {
  try {
    const {
      status,
      priority,
      issueType,
      zone,
      limit = '50',
      offset = '0',
    } = req.query;

    // ✅ Filter out archived reports by default
    const where: any = { archived: false };
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (issueType) where.issueType = issueType;
    if (zone) where.zone = zone;

    const { count, rows: reports } = await Report.findAndCountAll({
      where,
      include: [
        {
          model: User,
          as: 'citizen',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
    });

    const enrichedReports = await Promise.all(
      reports.map(async (report) => {
        const reportJson = report.toJSON();

        const stop = await RouteStop.findOne({
          where: { reportId: report.id },
          include: [
            {
              model: Route,
              as: 'route',
              include: [
                {
                  model: Truck,
                  as: 'truck',
                  attributes: ['id', 'truckId'],
                  include: [
                    {
                      model: User,
                      as: 'driver',
                      attributes: ['id', 'name'],
                    },
                  ],
                },
              ],
            },
          ],
        });

        const stopJson = stop ? (stop.toJSON() as any) : null;

        return {
          ...reportJson,
          assignedTruck: stopJson?.route?.truck?.truckId || null,
          assignedDriver: stopJson?.route?.truck?.driver?.name || null,
        };
      })
    );

    const withProof = await enrichReportsWithCompletionProof(enrichedReports);

    res.json({
      total: count,
      limit: parseInt(limit as string),
      offset: parseInt(offset as string),
      reports: withProof,
    });
  } catch (error: any) {
    console.error('Get all reports error:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET REPORT BY ID
// ============================================
export const getReportById = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id, {
      include: [
        {
          model: User,
          as: 'citizen',
          attributes: ['id', 'name', 'email', 'phone'],
        },
      ],
    });

    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isAuthor = report.citizenId === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isAssignedDriver =
      req.user.role === 'driver' && report.assignedTo === req.user.id;

    if (!isAuthor && !isAdmin && !isAssignedDriver) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have access to this report',
      });
    }

    const reportJson = report.toJSON() as any;

    // Strip adminResponse if viewer is not author or admin
    if (!isAuthor && !isAdmin) {
      delete reportJson.adminResponse;
      delete reportJson.adminRespondedAt;
      delete reportJson.adminRespondedBy;
    }

    const [withProof] = await enrichReportsWithCompletionProof([reportJson]);

    res.json({ report: withProof });
  } catch (error: any) {
    console.error('Get report by id error:', error);
    res.status(500).json({
      error: 'Failed to fetch report',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE REPORT STATUS
// ============================================
export const updateReportStatus = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { status, assignedTo } = req.body;

    if (!status) {
      return res.status(400).json({
        error: 'Missing status',
        message: 'status is required',
      });
    }

    const allowedStatuses = Object.values(ReportStatus);
    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        error: 'Invalid status',
        message: `status must be one of: ${allowedStatuses.join(', ')}`,
      });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    report.status = status;
    if (assignedTo !== undefined) {
      report.assignedTo = assignedTo || null;
    }
    if (status === ReportStatus.RESOLVED) {
      report.resolvedAt = new Date();
    }

    await report.save();

    res.json({
      message: 'Report status updated successfully',
      report,
    });
  } catch (error: any) {
    console.error('Update report status error:', error);
    res.status(500).json({
      error: 'Failed to update report',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// UPDATE REPORT
// ============================================
export const updateReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isOwner = report.citizenId === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only update your own reports',
      });
    }

    if (isOwner && !isAdmin && report.status !== ReportStatus.PENDING) {
      return res.status(403).json({
        error: 'Cannot update',
        message: 'You can only update reports that are still pending',
      });
    }

    const {
      description,
      address,
      latitude,
      longitude,
      photos,
      issueType,
      zone,
    } = req.body;

    if (description !== undefined) report.description = description;
    if (address !== undefined) report.address = address;
    if (zone !== undefined) report.zone = zone;
    if (latitude !== undefined) report.latitude = latitude;
    if (longitude !== undefined) report.longitude = longitude;
    if (photos !== undefined) report.photos = photos;
    if (issueType !== undefined) report.issueType = issueType;

    await report.save();

    res.json({ message: 'Report updated successfully', report });
  } catch (error: any) {
    console.error('Update report error:', error);
    res.status(500).json({
      error: 'Failed to update report',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE REPORT
// ============================================
export const deleteReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isOwner = report.citizenId === req.user.id;
    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own reports',
      });
    }

    if (isOwner && !isAdmin && report.status !== ReportStatus.PENDING) {
      return res.status(403).json({
        error: 'Cannot delete',
        message: 'You can only delete reports that are still pending',
      });
    }

    await report.destroy();
    res.json({ message: 'Report deleted successfully' });
  } catch (error: any) {
    console.error('Delete report error:', error);
    res.status(500).json({
      error: 'Failed to delete report',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET REPORT STATS
// ============================================
export const getReportStats = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const reports = await Report.findAll({
      where: { citizenId: req.user.id },
      attributes: ['status'],
    });

    const stats = {
      total: reports.length,
      pending: reports.filter((r) => r.status === ReportStatus.PENDING).length,
      inProgress: reports.filter((r) => r.status === ReportStatus.IN_PROGRESS)
        .length,
      resolved: reports.filter((r) => r.status === ReportStatus.RESOLVED)
        .length,
      rejected: reports.filter((r) => r.status === ReportStatus.REJECTED)
        .length,
    };

    res.json({ stats });
  } catch (error: any) {
    console.error('Get report stats error:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET REPORT COUNTS
// ============================================
export const getReportCounts = async (req: AuthRequest, res: Response) => {
  try {
    const reports = await Report.findAll({ attributes: ['status'] });

    const counts = {
      total: reports.length,
      pending: reports.filter((r) => r.status === ReportStatus.PENDING).length,
      inProgress: reports.filter((r) => r.status === ReportStatus.IN_PROGRESS)
        .length,
      resolved: reports.filter((r) => r.status === ReportStatus.RESOLVED)
        .length,
      rejected: reports.filter((r) => r.status === ReportStatus.REJECTED)
        .length,
    };

    res.json({ counts });
  } catch (error: any) {
    console.error('Get report counts error:', error);
    res.status(500).json({
      error: 'Failed to fetch counts',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET REPORTS BY CITIZEN
// ============================================
export const getReportsByCitizen = async (req: AuthRequest, res: Response) => {
  try {
    const { citizenId } = req.params;

    const citizen = await User.findByPk(citizenId, {
      attributes: ['id', 'name', 'email', 'phone'],
    });

    if (!citizen) {
      return res.status(404).json({ error: 'Citizen not found' });
    }

    const reports = await Report.findAll({
      where: { citizenId },
      order: [['createdAt', 'DESC']],
    });

    res.json({ citizen, count: reports.length, reports });
  } catch (error: any) {
    console.error('Get reports by citizen error:', error);
    res.status(500).json({
      error: 'Failed to fetch reports',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET COMMENTS
// ============================================
export const getReportComments = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isOwner = report.citizenId === req.user.id;

    if (req.user.role === 'citizen' && !isOwner) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only view comments on your own reports',
      });
    }

    const where: any = { reportId: req.params.id };
    if (req.user.role === 'citizen') {
      where.isInternal = false;
    }

    const comments = await ReportComment.findAll({
      where,
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role'],
        },
      ],
      order: [['createdAt', 'ASC']],
    });

    res.json({ count: comments.length, comments });
  } catch (error: any) {
    console.error('Get report comments error:', error);
    res.status(500).json({
      error: 'Failed to fetch comments',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// ADD COMMENT
// ============================================
export const addReportComment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { content, isInternal } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        error: 'Missing content',
        message: 'Comment content is required',
      });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isDriver = req.user.role === 'driver';
    const isOwner = report.citizenId === req.user.id;

    if (req.user.role === 'citizen' && !isOwner) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only comment on your own reports',
      });
    }

    const allowInternal = isAdmin || isDriver;
    const commentIsInternal = allowInternal && isInternal === true;

    const comment = await ReportComment.create({
      reportId: req.params.id,
      userId: req.user.id,
      content: content.trim(),
      isInternal: commentIsInternal,
    });

    const commentWithAuthor = await ReportComment.findByPk(comment.id, {
      include: [
        {
          model: User,
          as: 'author',
          attributes: ['id', 'name', 'email', 'role'],
        },
      ],
    });

    res.status(201).json({
      message: 'Comment added successfully',
      comment: commentWithAuthor,
    });
  } catch (error: any) {
    console.error('Add report comment error:', error);
    res.status(500).json({
      error: 'Failed to add comment',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// DELETE COMMENT
// ============================================
export const deleteReportComment = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const comment = await ReportComment.findByPk(req.params.commentId);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    const isAdmin = req.user.role === 'admin' || req.user.role === 'management';
    const isAuthor = comment.userId === req.user.id;

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You can only delete your own comments',
      });
    }

    await comment.destroy();
    res.json({ message: 'Comment deleted successfully' });
  } catch (error: any) {
    console.error('Delete report comment error:', error);
    res.status(500).json({
      error: 'Failed to delete comment',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// ASSIGN TRUCK TO COMPLAINT
// ✅ NEVER merges into an existing collection route.
//    Always creates a standalone "complaint response route" so the
//    assigned driver's fixed schedule stays clean (no phantom stops).
// ============================================
export const assignTruckToComplaint = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { truckId } = req.body;

    if (!truckId) {
      return res.status(400).json({
        error: 'Missing truck ID',
        message: 'truckId is required',
      });
    }

    const report = await Report.findByPk(id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    if (report.status === ReportStatus.RESOLVED) {
      return res.status(400).json({
        error: 'Already resolved',
        message: 'This complaint has already been resolved',
      });
    }

    const truck = await Truck.findByPk(truckId, {
      include: [{ model: User, as: 'driver' }],
    });
    if (!truck) {
      return res.status(404).json({ error: 'Truck not found' });
    }

    // ✅ Always create a NEW dedicated route for the complaint.
    const start = new Date();
    start.setHours(8, 0, 0, 0);
    const end = new Date();
    end.setHours(16, 0, 0, 0);

    const zoneToUse: ZoneName =
      (report.zone as ZoneName) || (truck.zone as ZoneName);

    const route = await Route.create({
      truckId: truck.id,
      zone: zoneToUse,
      suburb: report.address.split(',')[1]?.trim() || truck.zone,
      scheduledDate: new Date(),
      scheduledStart: start,
      scheduledEnd: end,
      estimatedDuration: 480,
      status: RouteStatus.PENDING,
      totalStops: 1,
      completedStops: 0,
      // ✅ Tagged in notes so the admin dashboard can filter it out
      notes: `Complaint response route — ${report.issueType}`,
    });

    const stop = await RouteStop.create({
      routeId: route.id,
      sequence: 1,
      address: report.address,
      suburb: report.zone || truck.zone,
      latitude: report.latitude
        ? parseFloat(report.latitude.toString())
        : -9.4438,
      longitude: report.longitude
        ? parseFloat(report.longitude.toString())
        : 147.1803,
      status: StopStatus.PENDING,
      isComplaintStop: true,
      complaintType: report.issueType as any,
      reportId: report.id,
    });

    // Update the report to reflect the assignment
    report.status = ReportStatus.IN_PROGRESS;
    if (truck.driverId) {
      report.assignedTo = truck.driverId;
    }
    await report.save();

    res.json({
      message: 'Truck assigned successfully',
      route,
      stop,
      report,
    });
  } catch (error: any) {
    console.error('Assign truck error:', error);
    res.status(500).json({
      error: 'Failed to assign truck',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// ADMIN RESPONDS TO REPORT / EMERGENCY ALERT
// POST /api/reports/:id/respond
// ============================================
export const respondToReport = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { response } = req.body;

    if (!response || !response.trim()) {
      return res.status(400).json({
        error: 'Missing response',
        message: 'A response message is required',
      });
    }

    const report = await Report.findByPk(req.params.id);
    if (!report) {
      return res.status(404).json({ error: 'Report not found' });
    }

    report.adminResponse = response.trim();
    report.adminRespondedAt = new Date();
    report.adminRespondedBy = req.user.id;

    if (report.status === ReportStatus.PENDING) {
      report.status = ReportStatus.IN_PROGRESS;
    }

    await report.save();

    res.json({
      message: 'Response sent successfully',
      report,
    });
  } catch (error: any) {
    console.error('Respond to report error:', error);
    res.status(500).json({
      error: 'Failed to send response',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};

// ============================================
// GET MY EMERGENCY RESPONSES (for driver)
// GET /api/reports/my-emergency-responses
// ============================================
export const getMyEmergencyResponses = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const reports = await Report.findAll({
      where: {
        citizenId: req.user.id,
        description: { [Op.like]: '[🚨 DRIVER EMERGENCY]%' },
        adminResponse: { [Op.not]: null },
        status: { [Op.notIn]: [ReportStatus.RESOLVED, ReportStatus.REJECTED] },
      },
      order: [['adminRespondedAt', 'DESC']],
      limit: 10,
    });

    res.json({
      count: reports.length,
      responses: reports.map((r) => ({
        id: r.id,
        emergencyType: r.description,
        adminResponse: r.adminResponse,
        respondedAt: r.adminRespondedAt,
        createdAt: r.createdAt,
        status: r.status,
      })),
    });
  } catch (error: any) {
    console.error('Get my emergency responses error:', error);
    res.status(500).json({
      error: 'Failed to fetch responses',
      message:
        process.env.NODE_ENV === 'development'
          ? error.message
          : 'Something went wrong',
    });
  }
};